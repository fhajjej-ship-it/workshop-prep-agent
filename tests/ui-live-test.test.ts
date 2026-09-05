import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { advanceUiRun, createUiRun, getUiConfig, readUiRun } from '../lib/ui-live-test';
import { createTestPack } from '../lib/test-pack';
import { LocalRunStore, PostgresRunStore } from '../lib/store';
import type { Brief, Run } from '../lib/types';
import { GET as readRoute } from '../app/api/runs/[id]/route';
import { GET as downloadRoute } from '../app/api/runs/[id]/download/route';
import { POST as createRoute } from '../app/api/runs/route';
import { POST as advanceRoute } from '../app/api/runs/[id]/advance/route';
import { packHash, scriptedContentReviewer } from '../lib/content-review';
import { validatePack } from '../lib/validation';

const brief: Brief = {
  audience: 'Synthetic executive group', objective: 'Choose one safe AI experiment',
  durationMinutes: 90, constraints: 'Synthetic examples only.', format: '',
};
const postgres = { WORKSHOP_STORE: 'postgres', DATABASE_URL: 'postgresql://test:test@example.test/workshop' };
async function fixture(fn: (directory: string) => Promise<void>) {
  const originalDirectory = process.cwd();
  const directory = await mkdtemp(path.join(originalDirectory, '.local-test-ui-'));
  const originalEnvironment = process.env;
  const originalFetch = globalThis.fetch;
  process.chdir(directory);
  process.env = {
    NODE_ENV: 'test', WORKSHOP_MODE: 'live', WORKSHOP_STORE: 'local',
    GOOGLE_GENERATIVE_AI_API_KEY: 'placeholder-ui-direct-key',
  };
  globalThis.fetch = async () => { throw new Error('Unexpected network access in local test.'); };
  try { await fn(directory); }
  finally {
    process.chdir(originalDirectory); process.env = originalEnvironment; globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
}

test('normal local readiness needs no manifest and still rejects missing keys or nonlocal live configuration', async () => fixture(async () => {
  assert.equal(getUiConfig().ready, true);
  assert.equal(getUiConfig({ ...process.env, WORKSHOP_UI_TEST_DIR: '/unused/old-allowance' }).ready, true);
  for (const override of [
    { VERCEL: '1' }, { WORKSHOP_STORE: 'postgres' }, { WORKSHOP_MODEL: 'another-model' },
    { GOOGLE_GENERATIVE_AI_API_KEY: '' }, { ...postgres, VERCEL: '1' },
  ]) assert.equal(getUiConfig({ ...process.env, ...override }).ready, false);
  assert.equal(getUiConfig({ ...process.env, ...postgres }).ready, true);
  assert.match(getUiConfig({ ...process.env, WORKSHOP_STORE: 'postgres' }).blockers.join(), /DATABASE_URL/);
  assert.equal(getUiConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' }).ready, true);
}));

test('repeated creation makes independent local runs without claims, ledgers or inference', async () => fixture(async directory => {
  const runs = await Promise.all([createUiRun(brief), createUiRun(brief)]);
  assert.notEqual(runs[0].id, runs[1].id);
  assert.ok(runs.every(run => run.status === 'ready' && run.steps === 0));
  assert.deepEqual((await readdir(path.join(directory, '.local', 'runs'))).sort(), runs.map(run => `${run.id}.json`).sort());
  assert.deepEqual(await readdir(path.join(directory, '.local')), ['runs']);
  assert.equal(getUiConfig().ready, true);
  assert.equal(await readUiRun(randomUUID()), null);
  assert.equal(await advanceUiRun(randomUUID()), null);
}));

test('run creation accepts bounded material snapshots and rejects empty or duplicate selections', async () => fixture(async directory => {
  const material = { id: 'supplied-reference', title: 'Supplied reference', content: 'x'.repeat(20_000), kind: 'text' };
  const request = (materials: unknown) => new Request('http://localhost/api/runs', {
    method: 'POST', headers: { origin: 'http://localhost' }, body: JSON.stringify({ brief, materials }),
  });
  const response = await createRoute(request([material]));
  assert.equal(response.status, 201);
  const { run } = await response.json();
  assert.deepEqual(run.materials, [material]);
  assert.equal(run.status, 'ready');
  assert.equal(run.steps, 0);
  assert.deepEqual((await readUiRun(run.id))?.materials, [material]);
  assert.equal((await createRoute(request([]))).status, 400);
  assert.equal((await createRoute(request([material, material]))).status, 400);
  assert.deepEqual(await readdir(path.join(directory, '.local', 'runs')), [`${run.id}.json`]);
}));

test('a local run resumes and downloads after switching to Postgres, while new runs use Postgres', async t => fixture(async directory => {
  const run = await createUiRun(brief);
  const plan = [
    ['ask_missing_info', {}],
    ['read_material', { id: 'facilitation-guide' }],
    ['read_material', { id: 'safe-experimentation' }],
    ['read_material', { id: 'use-case-selection' }],
    ['draft_pack', { pack: createTestPack({ ...brief, format: 'remote' }) }],
    ['validate_pack', {}],
  ] as const;
  let calls = 0;
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.generationConfig.maxOutputTokens, 6000);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    const [name, args] = plan[calls++];
    return new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args }, thoughtSignature: 'bW9jaw==' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 12, thoughtsTokenCount: 8, totalTokenCount: 100 },
      modelVersion: 'gemini-3.8-flash', responseId: `mock_ui_${calls}`,
    }), { headers: { 'content-type': 'application/json' } });
  };
  assert.equal((await advanceUiRun(run.id, undefined, fetch))?.status, 'awaiting_input');
  assert.equal(calls, 1);
  process.env = { ...process.env, ...postgres };
  const databaseRuns = new Map<string, Run>();
  const create = t.mock.method(PostgresRunStore.prototype, 'create', async (created: Run) => {
    databaseRuns.set(created.id, structuredClone(created));
  });
  const read = t.mock.method(PostgresRunStore.prototype, 'read', async (id: string) => {
    assert.notEqual(id, run.id, 'An existing local run must never query Postgres.');
    return structuredClone(databaseRuns.get(id) ?? null);
  });
  const save = t.mock.method(PostgresRunStore.prototype, 'save', async () => {
    assert.fail('Resuming an existing local run must never write to Postgres.');
  });
  assert.equal((await advanceUiRun(run.id, undefined, fetch))?.status, 'awaiting_input');
  assert.equal(calls, 1);
  const finished = await advanceUiRun(run.id, 'remote', fetch, undefined, scriptedContentReviewer);
  assert.equal(finished?.status, 'completed', finished?.error ?? 'Mocked UI workflow should finish');
  assert.equal(finished.validation?.valid, true);
  assert.equal(finished.steps, 7);
  assert.equal((await readUiRun(run.id))?.status, 'completed');
  assert.equal((await advanceUiRun(run.id, 'remote', fetch))?.status, 'completed');
  const downloaded = await downloadRoute(new Request(`http://localhost/api/runs/${run.id}/download?format=json`), { params: Promise.resolve({ id: run.id }) });
  assert.equal(downloaded.status, 200);
  assert.equal((await downloaded.json()).id, run.id);
  assert.equal(JSON.parse(await readFile(path.join(directory, '.local', 'runs', `${run.id}.json`), 'utf8')).status, 'completed');
  assert.equal(read.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
  const created = await createUiRun(brief);
  assert.notEqual(created.id, run.id);
  assert.equal(create.mock.callCount(), 1);
  assert.equal((await readUiRun(created.id))?.id, created.id);
  assert.equal(read.mock.callCount(), 1);
  assert.deepEqual(await readdir(path.join(directory, '.local', 'runs')), [`${run.id}.json`]);
  assert.equal(getUiConfig().ready, true);
  assert.equal(calls, 6);
}));

test('historical UI result stays readable, downloadable and terminal on advance without changing archived evidence', async () => fixture(async directory => {
  const historicalDirectory = path.join(directory, '.local', 'direct-google-ui-test-1');
  await mkdir(path.join(historicalDirectory, 'runs'), { recursive: true });
  const created = await createUiRun({ ...brief, format: 'remote' });
  const archived = {
    ...created, workflowVersion: undefined, id: randomUUID(), status: 'completed', pack: createTestPack({ ...brief, format: 'remote' }),
    validation: { valid: true, totalMinutes: 90, issues: [] }, steps: 7,
  };
  const files = {
    'claim.json': JSON.stringify({ runId: archived.id }),
    'session.json': JSON.stringify({ runId: archived.id, status: 'completed', preserved: 'historical ledger' }),
    [`runs/${archived.id}.json`]: JSON.stringify(archived),
  };
  for (const [filename, contents] of Object.entries(files)) await writeFile(path.join(historicalDirectory, filename), contents);
  process.env = { ...process.env, ...postgres };
  // Saved evidence is still readable even if current inference configuration is unavailable.
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';
  assert.equal(getUiConfig().ready, false);
  assert.equal((await readUiRun(archived.id))?.status, 'completed');
  const params = { params: Promise.resolve({ id: archived.id }) };
  assert.equal((await readRoute(new Request(`http://localhost/api/runs/${archived.id}`), params)).status, 200);
  const downloaded = await downloadRoute(new Request(`http://localhost/api/runs/${archived.id}/download?format=json`), params);
  assert.equal(downloaded.status, 200);
  assert.equal((await downloaded.json()).provenance.liveModelUsed, true);
  assert.equal((await advanceUiRun(archived.id, 'remote'))?.status, 'completed');
  for (const [filename, contents] of Object.entries(files)) assert.equal(await readFile(path.join(historicalDirectory, filename), 'utf8'), contents);
}));

test('ordinary completed workshops stay readable and downloadable when generation is unavailable', async () => fixture(async () => {
  const completed = await createUiRun({ ...brief, format: 'remote' });
  const unfinished = await createUiRun({ ...brief, format: 'remote' });
  const store = new LocalRunStore();
  const saved = await store.read(completed.id);
  assert.ok(saved);
  const chosen = saved.materials!;
  saved.pack = createTestPack(saved.brief, { materials: chosen });
  saved.readSourceIds = chosen.map(material => material.id);
  saved.revision = 1;
  saved.validation = validatePack(saved.pack, saved.brief, saved.readSourceIds, chosen);
  const review = await scriptedContentReviewer({ brief: saved.brief, materials: chosen, pack: saved.pack });
  saved.contentReview = {
    ...review, status: 'passed', reviewedRevision: saved.revision, reviewedPackHash: packHash(saved.pack),
    mode: 'scripted', attempt: 1, issues: [],
  };
  saved.status = 'completed';
  await store.save(saved);

  process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';
  assert.equal(getUiConfig().ready, false, 'Only generation readiness is unavailable.');
  const params = { params: Promise.resolve({ id: completed.id }) };
  assert.equal((await readRoute(new Request(`http://localhost/api/runs/${completed.id}`), params)).status, 200);
  for (const format of ['pdf', 'docx', 'md', 'json']) {
    const response = await downloadRoute(new Request(`http://localhost/api/runs/${completed.id}/download?format=${format}`), params);
    assert.equal(response.status, 200, `Saved workshop should still download as ${format}.`);
  }

  const createResponse = await createRoute(new Request('http://localhost/api/runs', {
    method: 'POST', headers: { origin: 'http://localhost' }, body: JSON.stringify({ brief }),
  }));
  assert.equal(createResponse.status, 503, 'Generation readiness must still gate new workshops.');
  const advanceResponse = await advanceRoute(new Request(`http://localhost/api/runs/${unfinished.id}/advance`, {
    method: 'POST', headers: { origin: 'http://localhost' }, body: '{}',
  }), { params: Promise.resolve({ id: unfinished.id }) });
  assert.equal(advanceResponse.status, 503, 'Generation readiness must still gate unfinished work.');
}));
