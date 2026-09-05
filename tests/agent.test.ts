import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { advanceRun, createRun, MAX_STEPS, readRun, RUN_TIMEOUT_MS } from '../lib/agent';
import { getConfig, LIVE_MODEL } from '../lib/config';
import { LocalRunStore, RunConflict } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief } from '../lib/types';
import { scriptedContentReviewer } from '../lib/content-review';

const brief: Brief = {
  audience: '12 executive leaders exploring AI',
  objective: 'Select one useful, low-risk AI experiment',
  durationMinutes: 90, constraints: 'Use only synthetic examples. No coding.', format: '',
};
const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });

async function withStore(fn: (store: LocalRunStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(process.cwd(), '.local-test-'));
  try { await fn(new LocalRunStore(directory), directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('SDK loop persists missing input, resumes from a fresh store, revises rejected timing and saves', async () => {
  await withStore(async (store, directory) => {
    const created = await createRun(brief, store, config);
    const paused = await advanceRun(created.id, store, undefined, { config });
    assert.equal(paused.status, 'awaiting_input');
    assert.equal(paused.events[0].tool, 'ask_missing_info');
    assert.equal(paused.steps, 1);
    const reloadedStore = new LocalRunStore(directory);
    assert.equal((await reloadedStore.read(created.id))?.clarification?.key, 'format');
    const finished = await advanceRun(created.id, reloadedStore, 'remote', { config });
    assert.equal(finished.status, 'completed', finished.error ?? 'Pack should finish');
    assert.equal(finished.mode, 'test');
    assert.equal(finished.model, null);
    assert.equal(finished.revision, 2);
    assert.equal(finished.validation?.valid, true);
    assert.equal(finished.validation.totalMinutes, 90);
    const validations = finished.events.filter(event => event.tool === 'validate_pack');
    assert.equal(validations.length, 2);
    assert.equal((validations[0].output as { valid: boolean }).valid, false);
    assert.equal((validations[1].output as { valid: boolean }).valid, true);
    assert.equal(finished.events.at(-1)?.tool, 'save_for_review');
    assert.ok(finished.messages.some(message => message.role === 'tool'));
    assert.ok(finished.steps <= MAX_STEPS);
    assert.equal((await advanceRun(created.id, reloadedStore, undefined, { config })).events.length, finished.events.length);
  });
});

test('loop cap fails visibly and cannot publish a partial draft', async () => {
  await withStore(async store => {
    const run = await createRun({ ...brief, format: 'in-person' }, store, config);
    const result = await advanceRun(run.id, store, undefined, { config, maxSteps: 3 });
    assert.equal(result.status, 'failed');
    assert.equal(result.steps, 3);
    assert.ok(!result.events.some(event => event.tool === 'save_for_review'));
    assert.match(result.error!, /bounded loop/);
  });
});

test('live configuration never silently falls back and rejects unsupported model IDs', () => {
  const missing = getConfig({ WORKSHOP_MODE: 'live' });
  assert.equal(missing.mode, 'live');
  assert.equal(missing.ready, false);
  assert.match(missing.blockers.join(), /GOOGLE_GENERATIVE_AI_API_KEY/);
  assert.equal(getConfig({ WORKSHOP_MODE: 'banana' }).ready, false);
  assert.equal(getConfig({ VERCEL: '1' }).ready, false);
  const prepared = getConfig({ WORKSHOP_MODE: 'live', GOOGLE_GENERATIVE_AI_API_KEY: 'test-placeholder' });
  assert.equal(prepared.model, 'gemini-3.8-flash');
  assert.equal(prepared.ready, true);
  assert.deepEqual(prepared.blockers, []);
  assert.match(getConfig({ WORKSHOP_MODE: 'live', AI_GATEWAY_API_KEY: 'gateway-only-placeholder' }).blockers.join(), /GOOGLE_GENERATIVE_AI_API_KEY/);
  assert.match(getConfig({ WORKSHOP_MODE: 'live', GOOGLE_GENERATIVE_AI_API_KEY: 'test-placeholder', WORKSHOP_MODEL: 'unknown/model' }).blockers.join(), /supports only gemini-3.8-flash/);
});

test('provider failure stays live, persists failure and never invokes deterministic tools', async () => {
  await withStore(async store => {
    const liveConfig = { ...config, mode: 'live' as const, model: LIVE_MODEL };
    const run = await createRun({ ...brief, format: 'hybrid' }, store, liveConfig);
    const failingProvider = new MockLanguageModelV4({ doGenerate: async () => { throw new Error('secret-provider-detail'); } });
    const failed = await advanceRun(run.id, store, undefined, { config: liveConfig, model: failingProvider });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.mode, 'live');
    assert.equal(failed.events.length, 0);
    assert.equal(failed.pack, undefined);
    assert.match(failed.error!, /No test output was substituted/);
    assert.ok(!JSON.stringify(await store.read(run.id)).includes('secret-provider-detail'));
  });
});

test('default direct model uses one mocked request and keeps provider failure details private', async t => {
  const previousEnv = process.env;
  process.env = { NODE_ENV: 'test', WORKSHOP_MODE: 'live', WORKSHOP_STORE: 'local', GOOGLE_GENERATIVE_AI_API_KEY: 'direct-test-placeholder' };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code: 403, message: 'secret-provider-detail', status: 'PERMISSION_DENIED' } }),
      { status: 403, headers: { 'content-type': 'application/json' } });
  });
  try {
    await withStore(async store => {
      const liveConfig = { ...config, mode: 'live' as const, model: LIVE_MODEL };
      const run = await createRun({ ...brief, format: 'remote' }, store, liveConfig);
      const stopped = await advanceRun(run.id, store, undefined, { config: liveConfig });
      assert.equal(stopped.status, 'failed');
      assert.match(stopped.error!, /No test output was substituted/);
      assert.equal(stopped.events.length, 0);
      assert.equal(stopped.pack, undefined);
      assert.ok(!JSON.stringify(await store.read(run.id)).includes('direct-test-placeholder'));
      assert.ok(!JSON.stringify(await store.read(run.id)).includes('secret-provider-detail'));
      assert.equal(calls, 1);
    });
  } finally { process.env = previousEnv; }
});

test('an injected live provider stops after the first tool error without another model call', async () => {
  await withStore(async store => {
    const liveConfig = { ...config, mode: 'live' as const, model: LIVE_MODEL };
    const run = await createRun({ ...brief, format: 'remote' }, store, liveConfig);
    let calls = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      calls += 1;
      return {
        content: [{ type: 'tool-call', toolCallId: 'missing-source', toolName: 'read_material', input: '{"id":"missing-source"}' }],
        finishReason: { unified: 'tool-calls', raw: undefined },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
        warnings: [],
      };
    } });
    const failed = await advanceRun(run.id, store, undefined, { config: liveConfig, model });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.events[0].status, 'error');
    assert.equal(calls, 1);
    assert.match(failed.error!, /tool error/);
  });
});

test('live draft schema feedback rejects the observed items wrapper, then permits correction, validation and save', async () => {
  await withStore(async store => {
    const liveConfig = { ...config, mode: 'live' as const, model: LIVE_MODEL };
    const run = await createRun({ ...brief, durationMinutes: 30, format: 'remote' }, store, liveConfig);
    const pack = createTestPack(run.brief);
    let calls = 0;
    const model = new MockLanguageModelV4({ doGenerate: async ({ prompt }) => {
      calls += 1;
      let toolName: string;
      let input: unknown;
      if (calls <= pack.sources.length) {
        toolName = 'read_material'; input = { id: pack.sources[calls - 1].id };
      } else if (calls === 4) {
        toolName = 'draft_pack'; input = { pack: { ...pack, agenda: { items: pack.agenda } } };
      } else if (calls === 5) {
        const feedback = prompt.filter(message => message.role === 'tool').flatMap(message => message.content)
          .find(part => part.type === 'tool-result' && part.toolName === 'draft_pack');
        assert.ok(feedback && feedback.type === 'tool-result');
        assert.equal(feedback.output.type, 'error-text');
        assert.match(JSON.stringify(feedback.output), /expected array, received object/);
        const rejected = (await store.read(run.id))!;
        assert.equal(rejected.pack, undefined);
        assert.equal(rejected.revision, 0);
        assert.ok(!rejected.events.some(event => event.tool === 'draft_pack'));
        toolName = 'draft_pack'; input = { pack };
      } else if (calls === 6) {
        assert.equal((await store.read(run.id))?.validation, undefined);
        toolName = 'validate_pack'; input = {};
      } else throw new Error('The passing reviewed pack should finalize without another planner call.');
      return {
        content: [{ type: 'tool-call', toolCallId: `draft-feedback-${calls}`, toolName, input: JSON.stringify(input) }],
        finishReason: { unified: 'tool-calls', raw: undefined },
        usage: { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } },
        warnings: [],
      };
    } });
    const finished = await advanceRun(run.id, store, undefined, { config: liveConfig, model, reviewer: scriptedContentReviewer });
    assert.equal(finished.status, 'completed', finished.error ?? 'Corrected draft should finish');
    assert.equal(calls, 6);
    assert.equal(finished.steps, 7);
    assert.equal(finished.revision, 1);
    assert.deepEqual(finished.pack?.agenda, pack.agenda);
    assert.equal(finished.validation?.valid, true);
    assert.equal(finished.validation.totalMinutes, 30);
    assert.deepEqual(finished.events.map(event => event.tool), ['read_material', 'read_material', 'read_material', 'draft_pack', 'validate_pack', 'review_content', 'save_for_review']);
  });
});

test('repeated draft schema errors exhaust the existing ten live steps without saving an invalid pack', async () => {
  await withStore(async store => {
    const liveConfig = { ...config, mode: 'live' as const, model: LIVE_MODEL };
    const run = await createRun({ ...brief, format: 'remote' }, store, liveConfig);
    const pack = createTestPack(run.brief);
    let calls = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      calls += 1;
      return {
        content: [{ type: 'tool-call', toolCallId: `invalid-agenda-${calls}`, toolName: 'draft_pack', input: JSON.stringify({ pack: { ...pack, agenda: { items: pack.agenda } } }) }],
        finishReason: { unified: 'tool-calls', raw: undefined },
        usage: { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } },
        warnings: [],
      };
    } });
    const failed = await advanceRun(run.id, store, undefined, { config: liveConfig, model });
    assert.equal(failed.status, 'failed');
    assert.equal(calls, 10);
    assert.equal(failed.steps, 10);
    assert.equal(failed.pack, undefined);
    assert.equal(failed.revision, 0);
    assert.equal(failed.events.length, 0);
    assert.match(failed.error!, /bounded loop/);
  });
});

test('stale writes cannot overwrite a claimed run', async () => {
  await withStore(async store => {
    const run = await createRun(brief, store, config);
    const copy = (await store.read(run.id))!;
    run.status = 'running';
    await store.save(run);
    await assert.rejects(() => store.save(copy), RunConflict);
    await assert.rejects(() => advanceRun(run.id, store, undefined, { config }), RunConflict);
    assert.equal((await store.read(run.id))?.status, 'running');
  });
});

test('interrupted clarification still includes the original brief when resumed', async () => {
  await withStore(async store => {
    const run = await createRun(brief, store, config);
    // Reproduce interruption between saving the question and saving model messages.
    run.status = 'awaiting_input';
    run.clarification = { key: 'format', question: 'Which delivery format?' };
    await store.save(run);
    const result = await advanceRun(run.id, store, 'remote', { config });
    assert.equal(result.status, 'completed');
    assert.ok(JSON.stringify(result.messages[0]).includes(brief.objective));
    assert.ok(JSON.stringify(result.messages[0]).includes(brief.audience));
  });
});

test('concurrent local writers have one winner across store instances', async () => {
  await withStore(async (store, directory) => {
    const run = await createRun(brief, store, config);
    const copy = (await store.read(run.id))!;
    const results = await Promise.allSettled([store.save(run), new LocalRunStore(directory).save(copy)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal((await store.read(run.id))?.version, 1);
  });
});

test('refresh resolves a stale interrupted request to a persisted failure without retrying', async () => {
  await withStore(async (store, directory) => {
    const run = await createRun(brief, store, config);
    run.status = 'running';
    run.updatedAt = new Date(Date.now() - RUN_TIMEOUT_MS - 60_000).toISOString();
    await writeFile(path.join(directory, `${run.id}.json`), JSON.stringify(run));
    assert.equal((await readRun(run.id, store))?.status, 'failed');
    const saved = (await store.read(run.id))!;
    assert.match(saved.error!, /interrupted/);
    assert.equal(saved.steps, 0);
  });
});
