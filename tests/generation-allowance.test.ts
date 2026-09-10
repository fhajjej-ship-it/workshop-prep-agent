import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { getConfig } from '../lib/config';
import { publicRun } from '../lib/agent';
import { admitLiveGeneration } from '../lib/generation-allowance';
import { createUiRun, advanceUiRun } from '../lib/ui-live-test';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import { packHash, scriptedContentReviewer } from '../lib/content-review';
import { POST as createRoute } from '../app/api/runs/route';
import { POST as reviseRoute } from '../app/api/runs/[id]/revise/route';
import { POST as advanceRoute } from '../app/api/runs/[id]/advance/route';
import { GET as readRoute } from '../app/api/runs/[id]/route';
import { GET as downloadRoute } from '../app/api/runs/[id]/download/route';
import { GET as exampleDownloadRoute } from '../app/api/example/download/route';
import type { Brief, Run } from '../lib/types';

const brief: Brief = { audience: 'Fictional team leaders', objective: 'Choose one safe AI pilot.', durationMinutes: 90, constraints: 'Fictional materials only.', format: 'remote' };
const liveEnv = { WORKSHOP_MODE: 'live', WORKSHOP_STORE: 'local', GOOGLE_GENERATIVE_AI_API_KEY: 'not-a-real-key' };
const request = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: 'POST', headers: { origin: 'http://localhost' }, body: JSON.stringify(body) });

async function fixture(fn: (directory: string) => Promise<void>) {
  const cwd = process.cwd();
  const env = process.env;
  const fetch = globalThis.fetch;
  const directory = await mkdtemp(path.join(cwd, '.local-test-allowance-'));
  process.chdir(directory);
  process.env = { NODE_ENV: 'test', ...liveEnv, WORKSHOP_DAILY_GENERATION_LIMIT: '2' };
  globalThis.fetch = async () => { throw new Error('Network calls are forbidden in this test.'); };
  try { await fn(directory); }
  finally { process.chdir(cwd); process.env = env; globalThis.fetch = fetch; await rm(directory, { recursive: true, force: true }); }
}

test('daily allowance configuration is explicit and malformed values fail closed', () => {
  assert.equal(getConfig(liveEnv).dailyGenerationLimit, undefined);
  for (const value of ['20', '0', '1']) {
    const config = getConfig({ ...liveEnv, WORKSHOP_DAILY_GENERATION_LIMIT: value });
    assert.equal(config.ready, true);
    assert.equal(config.dailyGenerationLimit, Number(value));
  }
  for (const value of ['', '-1', '1.5', '20x', 'Infinity', '9007199254740992']) {
    assert.equal(getConfig({ ...liveEnv, WORKSHOP_DAILY_GENERATION_LIMIT: value }).ready, false, value);
  }
});

test('new preparations and reruns share one cap; a refusal leaves the saved workshop intact', async () => fixture(async directory => {
  assert.equal((await createRoute(request('/api/runs', { brief, materials: [] }))).status, 400);
  const first = await createRoute(request('/api/runs', { brief }));
  assert.equal(first.status, 201);
  const initial: Run = (await first.json()).run;
  assert.equal('dailyGenerationReserved' in initial, false, 'Admission metadata is server-only.');
  const store = new LocalRunStore();
  const saved = (await store.read(initial.id))!;
  assert.equal(saved.dailyGenerationReserved, true);
  saved.status = 'completed';
  saved.pack = createTestPack(brief);
  saved.validation = { valid: true, totalMinutes: 90, issues: [] };
  saved.revision = 1;
  saved.contentReview = {
    ...await scriptedContentReviewer({ brief, materials: saved.materials!, pack: saved.pack }),
    status: 'passed', reviewedRevision: 1, reviewedPackHash: packHash(saved.pack), mode: 'scripted', attempt: 1, issues: [],
  };
  await store.save(saved);
  const parentBefore = JSON.stringify(await store.read(saved.id));
  const params = { params: Promise.resolve({ id: saved.id }) };
  const revised = await reviseRoute(request(`/api/runs/${saved.id}/revise`, { feedback: 'Shorten the introduction.' }), params);
  assert.equal(revised.status, 201);
  const revision = (await revised.json()).run;
  assert.equal(revision.parentRunId, saved.id);
  for (const blocked of [
    await createRoute(request('/api/runs', { brief })),
    await reviseRoute(request(`/api/runs/${saved.id}/revise`, { feedback: 'Improve the exercise.' }), params),
  ]) {
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /shared daily limit of 2.*00:00 UTC/);
    assert.ok(Number(blocked.headers.get('Retry-After')) > 0);
    assert.ok(Number(blocked.headers.get('Retry-After')) <= 86400);
  }
  assert.equal((await readdir(path.join(directory, '.local', 'runs'))).length, 2, 'Rejected starts create no extra cards.');
  assert.equal(JSON.stringify(await store.read(saved.id)), parentBefore);
  assert.equal((await readRoute(new Request(`http://localhost/api/runs/${saved.id}`), params)).status, 200);
  assert.equal((await downloadRoute(new Request(`http://localhost/api/runs/${saved.id}/download?format=md`), params)).status, 200);
  // Deleting a workshop never refunds its paid-run admission.
  const child = (await store.read(revision.id))!;
  await store.delete(child.id, child.version);
  assert.equal((await createRoute(request('/api/runs', { brief }))).status, 429);
}));

test('an admitted clarification can continue after pausing new starts without another reservation', async () => fixture(async () => {
  process.env.WORKSHOP_DAILY_GENERATION_LIMIT = '1';
  const run = await createUiRun({ ...brief, format: '' });
  let calls = 0;
  const fetch: typeof globalThis.fetch = async () => {
    calls++;
    if (calls > 1) throw new Error('Stop this mocked provider after proving the continuation was admitted.');
    return new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'ask_missing_info', args: {} } }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 },
    }), { headers: { 'content-type': 'application/json' } });
  };
  assert.equal((await advanceUiRun(run.id, undefined, fetch))?.status, 'awaiting_input');
  process.env.WORKSHOP_DAILY_GENERATION_LIMIT = '0';
  const resumed = await advanceUiRun(run.id, 'remote', fetch);
  assert.equal(calls, 2, 'The admitted continuation reaches the mock even when new starts are paused.');
  assert.equal(resumed?.status, 'failed', 'The intentionally stopped mock still follows ordinary failure handling.');
  const result = await createRoute(request('/api/runs', { brief }));
  assert.equal(result.status, 429);
  assert.match((await result.json()).error, /currently paused/);
}));

test('older unreserved runs cannot bypass a paused allowance through advance', async () => fixture(async () => {
  delete process.env.WORKSHOP_DAILY_GENERATION_LIMIT;
  const queued = await createUiRun(brief);
  const before = JSON.stringify(await new LocalRunStore().read(queued.id));
  process.env.WORKSHOP_DAILY_GENERATION_LIMIT = '0';
  const response = await advanceRoute(request(`/api/runs/${queued.id}/advance`, {}), { params: Promise.resolve({ id: queued.id }) });
  assert.equal(response.status, 429);
  assert.equal(JSON.stringify(await new LocalRunStore().read(queued.id)), before);
}));

test('storage failure blocks admission, while test mode and admitted runs need no quota lookup', async () => fixture(async () => {
  delete process.env.WORKSHOP_DAILY_GENERATION_LIMIT;
  const run = await createUiRun(brief);
  const config = getConfig({ ...liveEnv, WORKSHOP_DAILY_GENERATION_LIMIT: '20' });
  const brokenStore = { reserve: async () => { throw new Error('Private storage details must not leak.'); } };
  await assert.rejects(() => admitLiveGeneration(run, config, brokenStore), (error: unknown) => {
    const failure = error as { status: number; message: string };
    assert.equal(failure.status, 503);
    assert.match(failure.message, /allowance could not be checked/);
    assert.doesNotMatch(failure.message, /Private storage/);
    return true;
  });
  assert.equal(run.dailyGenerationReserved, undefined);
  assert.equal(await admitLiveGeneration({ ...run, mode: 'test' }, config, brokenStore), false);
  const admitted = { ...run, dailyGenerationReserved: true as const };
  assert.equal(await admitLiveGeneration(admitted, config, brokenStore), false);
  assert.equal('dailyGenerationReserved' in publicRun(admitted), false);
}));

test('saved example downloads remain independent of the allowance', async () => {
  const before = process.env.WORKSHOP_DAILY_GENERATION_LIMIT;
  process.env.WORKSHOP_DAILY_GENERATION_LIMIT = '0';
  try { assert.equal((await exampleDownloadRoute(new Request('http://localhost/api/example/download?format=docx'))).status, 200); }
  finally { if (before === undefined) delete process.env.WORKSHOP_DAILY_GENERATION_LIMIT; else process.env.WORKSHOP_DAILY_GENERATION_LIMIT = before; }
});
