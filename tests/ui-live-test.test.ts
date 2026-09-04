import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { advanceUiRun, createUiRun, getUiConfig, readUiRun } from '../lib/ui-live-test';
import { createTestPack } from '../lib/test-pack';
import type { Brief } from '../lib/types';
import { GET as readRoute } from '../app/api/runs/[id]/route';
import { GET as downloadRoute } from '../app/api/runs/[id]/download/route';

const brief: Brief = {
  audience: 'Synthetic executive group', objective: 'Choose one safe AI experiment',
  durationMinutes: 90, constraints: 'Synthetic examples only.', format: '',
};
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
    { GOOGLE_GENERATIVE_AI_API_KEY: '' },
  ]) assert.equal(getUiConfig({ ...process.env, ...override }).ready, false);
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

test('normal direct UI workflow pauses and resumes with mocked transport, then permits another run', async () => fixture(async () => {
  const run = await createUiRun(brief);
  const plan = [
    ['ask_missing_info', {}],
    ['read_material', { id: 'facilitation-guide' }],
    ['read_material', { id: 'safe-experimentation' }],
    ['read_material', { id: 'use-case-selection' }],
    ['draft_pack', { pack: createTestPack({ ...brief, format: 'remote' }) }],
    ['validate_pack', {}],
    ['save_for_review', {}],
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
  assert.equal((await advanceUiRun(run.id, undefined, fetch))?.status, 'awaiting_input');
  assert.equal(calls, 1);
  const finished = await advanceUiRun(run.id, 'remote', fetch);
  assert.equal(finished?.status, 'completed', finished?.error ?? 'Mocked UI workflow should finish');
  assert.equal(finished.validation?.valid, true);
  assert.equal(finished.steps, 7);
  assert.equal((await readUiRun(run.id))?.status, 'completed');
  assert.equal((await advanceUiRun(run.id, 'remote', fetch))?.status, 'completed');
  assert.notEqual((await createUiRun(brief)).id, run.id);
  assert.equal(getUiConfig().ready, true);
  assert.equal(calls, 7);
}));

test('historical UI result stays readable, downloadable and terminal on advance without changing archived evidence', async () => fixture(async directory => {
  const historicalDirectory = path.join(directory, '.local', 'direct-google-ui-test-1');
  await mkdir(path.join(historicalDirectory, 'runs'), { recursive: true });
  const created = await createUiRun({ ...brief, format: 'remote' });
  const archived = {
    ...created, id: randomUUID(), status: 'completed', pack: createTestPack({ ...brief, format: 'remote' }),
    validation: { valid: true, totalMinutes: 90, issues: [] }, steps: 7,
  };
  const files = {
    'claim.json': JSON.stringify({ runId: archived.id }),
    'session.json': JSON.stringify({ runId: archived.id, status: 'completed', preserved: 'historical ledger' }),
    [`runs/${archived.id}.json`]: JSON.stringify(archived),
  };
  for (const [filename, contents] of Object.entries(files)) await writeFile(path.join(historicalDirectory, filename), contents);
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
