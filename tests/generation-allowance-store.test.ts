import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { getGenerationAllowanceStore, LocalGenerationAllowanceStore, PostgresGenerationAllowanceStore } from '../lib/generation-allowance-store';

const today = () => new Date('2026-09-10T15:00:00.000Z');
const resetsAt = '2026-09-11T00:00:00.000Z';

async function withDirectory(fn: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(process.cwd(), '.local-test-generation-allowance-'));
  try { await fn(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('simultaneous new runs stop exactly at the daily cap across local store instances', async () => withDirectory(async directory => {
  const stores = [new LocalGenerationAllowanceStore(directory, today), new LocalGenerationAllowanceStore(path.join(directory, '.'), today)];
  const reservations = await Promise.all(Array.from({ length: 20 }, (_, index) => stores[index % 2].reserve(randomUUID(), 3)));
  assert.equal(reservations.filter(result => result.allowed).length, 3);
  assert.ok(reservations.every(result => result.resetsAt === resetsAt));
  assert.deepEqual(await readdir(directory), ['2026-09-10.json']);
  const stored = JSON.parse(await readFile(path.join(directory, '2026-09-10.json'), 'utf8'));
  assert.equal(stored.runIds.length, 3);
}));

test('the same run is idempotent under concurrency, restart and a later zero limit', async () => withDirectory(async directory => {
  const id = randomUUID();
  const store = new LocalGenerationAllowanceStore(directory, today);
  const sameRun = await Promise.all(Array.from({ length: 10 }, () => store.reserve(id, 1)));
  assert.ok(sameRun.every(result => result.allowed));
  const fresh = new LocalGenerationAllowanceStore(directory, today);
  assert.deepEqual(await fresh.reserve(id.toUpperCase(), 0), { allowed: true, resetsAt });
  assert.deepEqual(await fresh.reserve(randomUUID(), 1), { allowed: false, resetsAt });
  assert.deepEqual(await fresh.reserve(randomUUID(), 0), { allowed: false, resetsAt });
  assert.equal(JSON.parse(await readFile(path.join(directory, '2026-09-10.json'), 'utf8')).runIds.length, 1);
}));

test('zero allowance rejects the first run without creating a reservation', async () => withDirectory(async directory => {
  assert.deepEqual(await new LocalGenerationAllowanceStore(directory, today).reserve(randomUUID(), 0), { allowed: false, resetsAt });
  assert.deepEqual(await readdir(directory), []);
}));

test('the allowance resets at UTC midnight and preserves the previous day ledger', async () => withDirectory(async directory => {
  let now = new Date('2026-12-31T23:59:59.999Z');
  const store = new LocalGenerationAllowanceStore(directory, () => now);
  assert.deepEqual(await store.reserve(randomUUID(), 1), { allowed: true, resetsAt: '2027-01-01T00:00:00.000Z' });
  assert.equal((await store.reserve(randomUUID(), 1)).allowed, false);
  now = new Date('2027-01-01T00:00:00.000Z');
  assert.deepEqual(await store.reserve(randomUUID(), 1), { allowed: true, resetsAt: '2027-01-02T00:00:00.000Z' });
  assert.equal((await store.reserve(randomUUID(), 1)).allowed, false);
  assert.deepEqual((await readdir(directory)).sort(), ['2026-12-31.json', '2027-01-01.json']);
}));

test('corrupt or unavailable storage fails closed and never replaces the ledger', async () => withDirectory(async directory => {
  const store = new LocalGenerationAllowanceStore(directory, today);
  const filename = path.join(directory, '2026-09-10.json');
  const id = randomUUID();
  for (const content of ['{', '{}', '{"runIds":["invalid"]}', JSON.stringify({ runIds: [id, id.toUpperCase()] })]) {
    await writeFile(filename, content);
    await assert.rejects(store.reserve(randomUUID(), 1));
    assert.equal(await readFile(filename, 'utf8'), content);
  }
  const blocked = path.join(directory, 'blocked');
  await writeFile(blocked, 'not a directory');
  await assert.rejects(new LocalGenerationAllowanceStore(blocked, today).reserve(randomUUID(), 1));
  assert.equal(await readFile(blocked, 'utf8'), 'not a directory');
}));

test('invalid run IDs and limits fail before local storage or PostgreSQL calls', async () => withDirectory(async directory => {
  const postgres = new PostgresGenerationAllowanceStore('postgresql://test:test@database.invalid/test');
  let calls = 0;
  (postgres as unknown as { sql: unknown }).sql = Object.assign(() => { calls++; }, { transaction: () => { calls++; } });
  for (const store of [new LocalGenerationAllowanceStore(directory, today), postgres]) {
    for (const id of ['../run', '00000000-0000-0000-0000-000000000000', '']) await assert.rejects(store.reserve(id, 1), /Invalid run ID/);
    for (const limit of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(store.reserve(randomUUID(), limit), /nonnegative safe integer/);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await readdir(directory), []);
}));

test('PostgreSQL adapter batches claims atomically and returns denial reset time (mock SQL only)', async () => {
  const store = new PostgresGenerationAllowanceStore('postgresql://test:test@database.invalid/test');
  const id = randomUUID();
  type Statement = { query: string; values: unknown[] };
  const statements: Statement[] = [];
  const tag = (parts: TemplateStringsArray, ...values: unknown[]) => {
    const statement = { query: parts.join('?').replace(/\s+/g, ' ').trim(), values };
    statements.push(statement);
    return statement;
  };
  let allowed = true;
  (store as unknown as { sql: unknown }).sql = Object.assign(tag, {
    transaction: async (queries: Statement[]) => {
      assert.equal(queries.length, 2);
      assert.match(queries[0].query, /INSERT INTO workshop_generation_allowance.*ON CONFLICT \(allowance_date\) DO NOTHING/);
      assert.match(queries[1].query, /UPDATE workshop_generation_allowance.*ANY\(run_ids\).*cardinality\(run_ids\) < \?::bigint/);
      assert.match(queries[1].query, /SELECT EXISTS \(SELECT 1 FROM reservation\) AS allowed/);
      assert.ok(queries.every(query => query.query.includes("now() AT TIME ZONE 'UTC'")));
      assert.deepEqual(queries[1].values, [id, id, id, allowed ? 1 : 0]);
      return [[], [{ allowed, resetsAt }]];
    },
  });
  assert.deepEqual(await store.reserve(id, 1), { allowed: true, resetsAt });
  allowed = false;
  assert.deepEqual(await store.reserve(id, 0), { allowed: false, resetsAt });
  assert.equal(statements.length, 4);
});

test('PostgreSQL errors and malformed responses cannot allow a claim (mock SQL only)', async () => {
  const store = new PostgresGenerationAllowanceStore('postgresql://test:test@database.invalid/test');
  for (const response of [undefined, [[], []], [[], [{ allowed: 'true', resetsAt }]]]) {
    (store as unknown as { sql: unknown }).sql = Object.assign(() => ({}), { transaction: async () => response });
    await assert.rejects(store.reserve(randomUUID(), 1));
  }
  (store as unknown as { sql: unknown }).sql = Object.assign(() => ({}), {
    transaction: async () => { throw new Error('Storage unavailable'); },
  });
  await assert.rejects(store.reserve(randomUUID(), 1), /Storage unavailable/);
});

test('allowance storage selection shares the configured durable-storage blockers', t => {
  const previous = process.env;
  t.after(() => { process.env = previous; });
  process.env = { NODE_ENV: 'test', WORKSHOP_STORE: 'local' };
  assert.ok(getGenerationAllowanceStore() instanceof LocalGenerationAllowanceStore);
  process.env = { NODE_ENV: 'test', WORKSHOP_STORE: 'postgres', DATABASE_URL: 'postgresql://test:test@database.invalid/test' };
  assert.ok(getGenerationAllowanceStore() instanceof PostgresGenerationAllowanceStore);
  process.env = { NODE_ENV: 'test', WORKSHOP_STORE: 'postgres' };
  assert.throws(getGenerationAllowanceStore, /Postgres storage requires/);
  process.env = { NODE_ENV: 'test', WORKSHOP_STORE: 'local', VERCEL: '1' };
  assert.throws(getGenerationAllowanceStore, /not durable on Vercel/);
});
