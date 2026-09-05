import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { createRun, publicRun } from '../lib/agent';
import { getConfig } from '../lib/config';
import { hasCurrentContentReview, packHash, scriptedContentReviewer } from '../lib/content-review';
import { LocalRunStore, PostgresRunStore, RunConflict } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief, Run } from '../lib/types';
import { assertManagementOrigin, localLegacyManagement, managementCookieName, managementIdentity, ownsWorkshop } from '../lib/workshop-management';
import { GET as configRoute } from '../app/api/config/route';
import { POST as createRoute } from '../app/api/runs/route';
import { GET, PATCH, DELETE } from '../app/api/runs/[id]/route';
import { POST as reviseRoute } from '../app/api/runs/[id]/revise/route';
import { GET as downloadRoute } from '../app/api/runs/[id]/download/route';

const origin = 'http://127.0.0.1:3210';
const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const brief: Brief = { audience: 'Eight facilitators', objective: 'Choose a concrete experiment and identify its owner.', durationMinutes: 30, constraints: 'Synthetic input.', format: 'remote' };
const ownerToken = 'a'.repeat(43);
const ownerCookie = `${managementCookieName}=${ownerToken}`;
const ownerHash = createHash('sha256').update(ownerToken).digest('hex');
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function request(id: string, method = 'GET', body?: unknown, cookie?: string, requestOrigin: string | null = origin) {
  return new Request(`${origin}/api/runs/${id}`, {
    method, headers: { ...(requestOrigin ? { origin: requestOrigin } : {}), ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function fixture(t: TestContext, work: (store: LocalRunStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-management-'));
  const previousDirectory = process.cwd();
  const previousEnvironment = process.env;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network access is forbidden in management tests.'); });
  try {
    process.chdir(directory);
    process.env = { NODE_ENV: 'development', WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' };
    await work(new LocalRunStore(), directory);
  } finally {
    process.chdir(previousDirectory);
    process.env = previousEnvironment;
    await rm(directory, { recursive: true, force: true });
  }
}

async function completedRun(store: LocalRunStore, hash?: string) {
  const run = await createRun(brief, store, config, undefined, hash);
  run.pack = createTestPack(brief);
  run.status = 'completed';
  run.revision = 1;
  run.validation = { valid: true, totalMinutes: 30, issues: [] };
  run.contentReview = { status: 'passed', reviewedRevision: 1, reviewedPackHash: packHash(run.pack), mode: 'scripted', attempt: 1, issues: [], checks: (await scriptedContentReviewer({ brief, materials: run.materials!, pack: run.pack })).checks };
  await store.save(run);
  return run;
}

test('legacy management requires development and exact loopback, and owned runs never use the legacy exception', () => {
  const development = { NODE_ENV: 'development' };
  const legacy = { id: randomUUID() } as Run;
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(localLegacyManagement(new Request(`http://${host}:3210/`), development), true);
  for (const host of ['example.com', 'localhost.example.com', '192.168.1.2']) assert.equal(localLegacyManagement(new Request(`http://${host}/`), development), false);
  assert.equal(localLegacyManagement(new Request(origin, { headers: { host: 'example.com' } }), development), false);
  for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { NODE_ENV: 'development', VERCEL: '1' }, { NODE_ENV: 'development', RENDER: 'true' }]) {
    assert.equal(ownsWorkshop(request(legacy.id), legacy, env), false);
  }
  const owned = { ...legacy, managementHash: ownerHash };
  assert.equal(ownsWorkshop(request(owned.id), owned, development), false);
  assert.equal(ownsWorkshop(request(owned.id, 'GET', undefined, `${managementCookieName}=${'b'.repeat(43)}`), owned, development), false);
  assert.equal(ownsWorkshop(request(owned.id, 'GET', undefined, ownerCookie), owned, { NODE_ENV: 'production' }), true);
  assert.equal(ownsWorkshop(request(owned.id, 'GET', undefined, `${ownerCookie}; ${ownerCookie}`), owned, development), false);
  assert.throws(() => assertManagementOrigin(request(owned.id, 'DELETE', undefined, ownerCookie, null)), /same-origin/);
  assert.throws(() => assertManagementOrigin(request(owned.id, 'PATCH', undefined, ownerCookie, 'https://attacker.example')), /same-origin/);
  assert.doesNotThrow(() => assertManagementOrigin(request(owned.id, 'DELETE', undefined, ownerCookie)));
});

test('bootstrap cookie grants only new records and revision creation uses its own browser identity', async t => fixture(t, async store => {
  const bootstrap = configRoute(new Request(`${origin}/api/config`));
  const setCookie = bootstrap.headers.get('set-cookie')!;
  assert.match(setCookie, /HttpOnly; SameSite=Strict/);
  const cookie = setCookie.split(';')[0];
  const identity = managementIdentity(new Request(origin, { headers: { cookie } }));
  assert.equal(Buffer.from(identity.token, 'base64url').length, 32);
  const createdResponse = await createRoute(new Request(`${origin}/api/runs`, { method: 'POST', headers: { origin, cookie }, body: JSON.stringify({ brief }) }));
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).run;
  assert.equal(created.managementHash, undefined);
  assert.equal((await store.read(created.id))?.managementHash, identity.hash);
  const parent = await completedRun(store, ownerHash);
  const revision = await reviseRoute(new Request(`${origin}/api/runs/${parent.id}/revise`, { method: 'POST', headers: { origin, cookie }, body: JSON.stringify({ feedback: 'Shorten the opening activity.' }) }), context(parent.id));
  assert.equal(revision.status, 201);
  const child = (await revision.json()).run;
  assert.equal(child.managementHash, undefined);
  assert.equal((await store.read(child.id))?.managementHash, identity.hash);
  assert.equal((await store.read(parent.id))?.managementHash, ownerHash);
  const anonymousRead = await GET(request(parent.id), context(parent.id));
  assert.equal((await anonymousRead.json()).canManage, false);
  assert.equal(anonymousRead.headers.get('set-cookie'), null);
  const crossSite = configRoute(new Request(`${origin}/api/config`, { headers: { 'sec-fetch-site': 'cross-site' } }));
  assert.equal(crossSite.headers.get('set-cookie'), null);
  process.env = { ...process.env, NODE_ENV: 'production' };
  assert.match(configRoute(new Request('https://workshops.example/api/config')).headers.get('set-cookie')!, /; Secure/);
}));

test('rename preserves reviewed pack and exports, with private capability omitted everywhere', async t => fixture(t, async store => {
  const run = await completedRun(store, ownerHash);
  const packBefore = structuredClone(run.pack);
  const reviewBefore = structuredClone(run.contentReview);
  // Management must remain available when only live generation is unavailable.
  process.env.WORKSHOP_MODE = 'live';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';
  const renamed = await PATCH(request(run.id, 'PATCH', { displayName: '  Customer planning workshop  ', version: run.version }, ownerCookie), context(run.id));
  assert.equal(renamed.status, 200);
  const payload = await renamed.json();
  assert.equal(payload.canManage, true);
  assert.equal(payload.run.displayName, 'Customer planning workshop');
  assert.equal(payload.run.version, run.version + 1);
  const saved = (await store.read(run.id))!;
  assert.deepEqual(saved.pack, packBefore);
  assert.deepEqual(saved.contentReview, reviewBefore);
  assert.equal(hasCurrentContentReview(saved), true);
  assert.equal('managementHash' in publicRun(saved), false);
  for (const format of ['json', 'md', 'pdf', 'docx']) {
    const downloaded = await downloadRoute(new Request(`${origin}/api/runs/${run.id}/download?format=${format}`), context(run.id));
    assert.equal(downloaded.status, 200);
    const exported = Buffer.from(await downloaded.arrayBuffer());
    assert.equal(exported.includes(Buffer.from(ownerHash)), false);
    if (format === 'json') assert.equal(JSON.parse(exported.toString()).managementHash, undefined);
  }
  assert.equal((await GET(request(run.id, 'GET', undefined, ownerCookie), context(run.id))).status, 200);
}));

test('mutations reject wrong authority, missing origins, malformed versions and active work without changing the record', async t => fixture(t, async store => {
  const run = await completedRun(store, ownerHash);
  const before = JSON.stringify(await store.read(run.id));
  const rename = { displayName: 'Changed name', version: run.version };
  assert.equal((await PATCH(request(run.id, 'PATCH', rename), context(run.id))).status, 403);
  assert.equal((await DELETE(request(run.id, 'DELETE', { version: run.version }, ownerCookie, null), context(run.id))).status, 403);
  assert.equal((await PATCH(request(run.id, 'PATCH', rename, ownerCookie, 'https://attacker.example'), context(run.id))).status, 403);
  for (const version of [-1, 0.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await DELETE(request(run.id, 'DELETE', { version }, ownerCookie), context(run.id))).status, 400);
  }
  assert.equal((await PATCH(request(run.id, 'PATCH', { ...rename, displayName: '\u0000' }, ownerCookie), context(run.id))).status, 400);
  assert.equal((await DELETE(request(run.id, 'DELETE', { version: run.version - 1 }, ownerCookie), context(run.id))).status, 409);
  assert.equal(JSON.stringify(await store.read(run.id)), before);
  run.status = 'running';
  await store.save(run);
  assert.equal((await PATCH(request(run.id, 'PATCH', { ...rename, version: run.version }, ownerCookie), context(run.id))).status, 409);
  assert.equal((await DELETE(request(run.id, 'DELETE', { version: run.version }, ownerCookie), context(run.id))).status, 409);
  assert.equal((await store.read(run.id))?.status, 'running');
}));

test('local legacy rename claims authority; deletion removes the actual record and later saves cannot resurrect it', async t => fixture(t, async store => {
  const run = await completedRun(store);
  const renamed = await PATCH(request(run.id, 'PATCH', { displayName: 'Legacy workshop', version: run.version }), context(run.id));
  assert.equal(renamed.status, 200);
  const cookie = renamed.headers.get('set-cookie')!.split(';')[0];
  const saved = (await store.read(run.id))!;
  assert.ok(saved.managementHash);
  assert.equal((await DELETE(request(run.id, 'DELETE', { version: saved.version }), context(run.id))).status, 403);
  const deleted = await DELETE(request(run.id, 'DELETE', { version: saved.version }, cookie), context(run.id));
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: true });
  assert.equal(await store.read(run.id), null);
  assert.equal((await GET(request(run.id), context(run.id))).status, 404);
  await assert.rejects(store.save(saved), RunConflict);
  assert.equal(await store.read(run.id), null);
}));

test('save and delete use the same local lock in both orderings', async t => fixture(t, async store => {
  const run = await completedRun(store, ownerHash);
  const staleVersion = run.version;
  const write = store.save(run);
  const remove = new LocalRunStore().delete(run.id, staleVersion);
  const results = await Promise.allSettled([write, remove]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal((await store.read(run.id))?.version, staleVersion + 1);
  const deletion = store.delete(run.id, run.version);
  const staleSave = new LocalRunStore().save(run);
  const reverse = await Promise.allSettled([deletion, staleSave]);
  assert.equal(reverse[0].status, 'fulfilled');
  assert.equal(reverse[1].status, 'rejected');
  assert.equal(await store.read(run.id), null);
}));

test('mutations resolve local fallback after Postgres switch and refuse archived evidence', async t => fixture(t, async (store, directory) => {
  const run = await completedRun(store, ownerHash);
  const archive = path.join(directory, '.local', 'direct-google-ui-test-1');
  await mkdir(path.join(archive, 'runs'), { recursive: true });
  const archived = { ...run, id: randomUUID() };
  const archivedText = JSON.stringify(archived);
  await writeFile(path.join(archive, 'claim.json'), JSON.stringify({ runId: archived.id }));
  await writeFile(path.join(archive, 'runs', `${archived.id}.json`), archivedText);
  process.env.WORKSHOP_STORE = 'postgres';
  process.env.DATABASE_URL = 'postgresql://test:test@database.invalid/test';
  t.mock.method(PostgresRunStore.prototype, 'read', async () => { assert.fail('Existing local and archive records must not read Postgres.'); });
  t.mock.method(PostgresRunStore.prototype, 'save', async () => { assert.fail('Existing local and archive records must not write Postgres.'); });
  t.mock.method(PostgresRunStore.prototype, 'delete', async () => { assert.fail('Existing local and archive records must not delete from Postgres.'); });
  const renamed = await PATCH(request(run.id, 'PATCH', { displayName: 'Local fallback', version: run.version }, ownerCookie), context(run.id));
  assert.equal(renamed.status, 200);
  assert.equal((await store.read(run.id))?.displayName, 'Local fallback');
  assert.equal((await DELETE(request(run.id, 'DELETE', { version: run.version + 1 }, ownerCookie), context(run.id))).status, 200);
  assert.equal((await GET(request(archived.id, 'GET', undefined, ownerCookie), context(archived.id))).status, 200);
  assert.equal((await (await GET(request(archived.id, 'GET', undefined, ownerCookie), context(archived.id))).json()).canManage, false);
  assert.equal((await PATCH(request(archived.id, 'PATCH', { displayName: 'Forbidden', version: archived.version }, ownerCookie), context(archived.id))).status, 403);
  assert.equal((await DELETE(request(archived.id, 'DELETE', { version: archived.version }, ownerCookie), context(archived.id))).status, 403);
  assert.equal(await readFile(path.join(archive, 'runs', `${archived.id}.json`), 'utf8'), archivedText);
}));

test('Postgres deletion uses version CAS and an existing-record UPDATE cannot resurrect a deletion (mock SQL only)', async t => fixture(t, async local => {
  const run = await completedRun(local, ownerHash);
  const rows = new Map([[run.id, structuredClone(run)]]);
  const store = new PostgresRunStore('postgresql://test:test@database.invalid/test');
  (store as unknown as { sql: unknown }).sql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const sql = parts.join('?');
    if (sql.startsWith('DELETE')) {
      assert.match(sql, /WHERE id = \?::uuid AND version = \? RETURNING id/);
      const [id, version] = values as [string, number];
      if (rows.get(id)?.version !== version) return [];
      rows.delete(id);
      return [{ id }];
    }
    assert.match(sql, /^UPDATE workshop_runs SET/);
    const [data, , id, version] = values as [string, number, string, number];
    if (rows.get(id)?.version !== version) return [];
    rows.set(id, JSON.parse(data));
    return [{ id }];
  };
  await assert.rejects(store.delete(run.id, run.version - 1), RunConflict);
  assert.ok(rows.has(run.id));
  await store.save(run);
  await assert.rejects(store.delete(run.id, run.version - 1), RunConflict);
  await store.delete(run.id, run.version);
  await assert.rejects(store.save(run), RunConflict);
  assert.equal(rows.has(run.id), false);
}));

test('legacy Postgres records are manageable on the local development server and fail closed when hosted (mock store only)', async t => fixture(t, async local => {
  const base = await completedRun(local);
  const legacy = { ...base, id: randomUUID() };
  const records = new Map<string, Run>([[legacy.id, structuredClone(legacy)]]);
  process.env.WORKSHOP_STORE = 'postgres';
  process.env.DATABASE_URL = 'postgresql://test:test@database.invalid/test';
  process.env.WORKSHOP_MODE = 'live';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';
  t.mock.method(PostgresRunStore.prototype, 'read', async (id: string) => structuredClone(records.get(id) ?? null));
  t.mock.method(PostgresRunStore.prototype, 'save', async (run: Run) => {
    if (records.get(run.id)?.version !== run.version) throw new RunConflict('Changed');
    run.version++;
    records.set(run.id, structuredClone(run));
  });
  t.mock.method(PostgresRunStore.prototype, 'delete', async (id: string, version: number) => {
    if (records.get(id)?.version !== version) throw new RunConflict('Changed');
    records.delete(id);
  });
  process.env.VERCEL = '1';
  assert.equal((await DELETE(request(legacy.id, 'DELETE', { version: legacy.version }), context(legacy.id))).status, 403);
  assert.ok(records.has(legacy.id));
  delete process.env.VERCEL;
  const renamed = await PATCH(request(legacy.id, 'PATCH', { displayName: 'Managed locally', version: legacy.version }), context(legacy.id));
  assert.equal(renamed.status, 200);
  const cookie = renamed.headers.get('set-cookie')!.split(';')[0];
  assert.equal(records.get(legacy.id)?.displayName, 'Managed locally');
  assert.equal((await DELETE(request(legacy.id, 'DELETE', { version: legacy.version + 1 }, cookie), context(legacy.id))).status, 200);
  assert.equal(records.has(legacy.id), false);
}));
