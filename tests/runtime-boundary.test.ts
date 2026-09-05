import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { maxDuration } from '../app/api/runs/[id]/advance/route';
import { advanceRun, createRun, publicRun, RUN_TIMEOUT_MS } from '../lib/agent';
import { getConfig, LIVE_MODEL } from '../lib/config';
import { scriptedContentReviewer } from '../lib/content-review';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief } from '../lib/types';

const config = { ...getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' }), mode: 'live' as const, model: LIVE_MODEL };
const brief: Brief = {
  audience: 'Four fictional product peers', objective: 'Agree responsibility owners using fictional cases.',
  durationMinutes: 60, constraints: 'Use supplied synthetic cases only.', format: 'remote',
};
const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};
function toolResponse(toolName: string, input: unknown, call: number) {
  return {
    content: [{ type: 'tool-call' as const, toolCallId: `runtime-${call}`, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: 'tool-calls' as const, raw: undefined }, usage, warnings: [],
  };
}
async function withStore(action: (store: LocalRunStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(process.cwd(), '.local-test-runtime-boundary-'));
  try { await action(new LocalRunStore(directory), directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('the preparation budget is three minutes with route headroom for final persistence', () => {
  assert.equal(RUN_TIMEOUT_MS, 3 * 60 * 1000);
  assert.equal(maxDuration, 4 * 60);
  assert.ok(maxDuration * 1000 >= RUN_TIMEOUT_MS + 30_000);
});

test('a later provider failure preserves completed source and invalid-draft messages privately', async () => {
  await withStore(async (store, directory) => {
    const run = await createRun(brief, store, config);
    const pack = createTestPack(brief);
    let calls = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      calls += 1;
      if (calls === 1) return toolResponse('read_material', { id: pack.sources[0].id }, calls);
      if (calls === 2) return toolResponse('draft_pack', { pack: { ...pack, agenda: { items: pack.agenda } } }, calls);
      const saved = (await new LocalRunStore(directory).read(run.id))!;
      assert.equal(saved.messages.length, 5, 'The previous two completed steps must already be persisted.');
      throw new Error('private-provider-payload');
    } });

    const failed = await advanceRun(run.id, store, undefined, { config, model });
    assert.equal(failed.status, 'failed');
    assert.equal(calls, 3);
    assert.equal(failed.revision, 0);
    assert.equal(failed.pack, undefined);
    assert.deepEqual(failed.messages.map(message => message.role), ['user', 'assistant', 'tool', 'assistant', 'tool']);
    const toolParts = failed.messages.filter(message => message.role === 'tool').flatMap(message => message.content);
    const feedback = toolParts.find(part => part.type === 'tool-result' && part.toolName === 'draft_pack');
    assert.ok(feedback && feedback.type === 'tool-result');
    assert.equal(feedback.output.type, 'error-text');
    assert.match(JSON.stringify(feedback.output), /expected array, received object/);
    assert.deepEqual((await new LocalRunStore(directory).read(run.id))?.messages, JSON.parse(JSON.stringify(failed.messages)));
    assert.equal('messages' in publicRun(failed), false);
    assert.equal(JSON.stringify(failed).includes('private-provider-payload'), false);
    assert.match(failed.error!, /model request failed\./);
    assert.doesNotMatch(failed.error!, /timed out/);
  });
});

test('successful completion keeps each completed step once when final SDK messages replace partial history', async () => {
  await withStore(async store => {
    const run = await createRun(brief, store, config);
    const pack = createTestPack(brief);
    let calls = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      calls += 1;
      if (calls <= pack.sources.length) return toolResponse('read_material', { id: pack.sources[calls - 1].id }, calls);
      if (calls === pack.sources.length + 1) return toolResponse('draft_pack', { pack }, calls);
      return toolResponse('validate_pack', {}, calls);
    } });
    const finished = await advanceRun(run.id, store, undefined, { config, model, reviewer: scriptedContentReviewer });
    assert.equal(finished.status, 'completed', finished.error ?? 'Expected a completed workshop.');
    assert.equal(calls, pack.sources.length + 2);
    assert.equal(finished.messages.length, 1 + calls * 2);
    const toolCalls = finished.messages.filter(message => message.role === 'assistant').flatMap(message => typeof message.content === 'string' ? [] : message.content)
      .filter(part => part.type === 'tool-call');
    assert.equal(toolCalls.length, calls);
    assert.equal(new Set(toolCalls.map(part => part.toolCallId)).size, calls);
    assert.deepEqual((await store.read(run.id))?.messages, JSON.parse(JSON.stringify(finished.messages)));
  });
});

test('deadline expiration and confirmed timeout errors have safe explicit timeout failures', async t => {
  for (const cause of ['deadline', 'timeout-error'] as const) {
    await t.test(cause, async context => {
      await withStore(async store => {
        const run = await createRun(brief, store, config);
        let clock = Date.now();
        context.mock.method(Date, 'now', () => clock);
        let calls = 0;
        const model = new MockLanguageModelV4({ doGenerate: async () => {
          calls += 1;
          if (cause === 'deadline') clock += RUN_TIMEOUT_MS + 1;
          const error = new Error('private-timeout-payload');
          if (cause === 'timeout-error') error.name = 'TimeoutError';
          throw error;
        } });
        const failed = await advanceRun(run.id, store, undefined, { config, model });
        assert.equal(failed.status, 'failed');
        assert.equal(calls, 1);
        assert.match(failed.error!, /Preparation timed out/);
        assert.match(failed.error!, /no automatic retry/);
        assert.equal(JSON.stringify(failed).includes('private-timeout-payload'), false);
      });
    });
  }
});

test('a confirmed content-review timeout retains the draft and reports no review pass or retry', async () => {
  await withStore(async store => {
    const run = await createRun(brief, store, config);
    const pack = createTestPack(brief);
    let calls = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      calls += 1;
      if (calls <= pack.sources.length) return toolResponse('read_material', { id: pack.sources[calls - 1].id }, calls);
      if (calls === pack.sources.length + 1) return toolResponse('draft_pack', { pack }, calls);
      return toolResponse('validate_pack', {}, calls);
    } });
    let reviews = 0;
    const failed = await advanceRun(run.id, store, undefined, { config, model, reviewer: async () => {
      reviews += 1;
      const error = new Error('private-review-timeout-payload');
      error.name = 'TimeoutError';
      throw error;
    } });
    assert.equal(failed.status, 'failed');
    assert.deepEqual(failed.pack, pack);
    assert.equal(failed.validation?.valid, true);
    assert.equal(failed.contentReview, undefined);
    assert.equal(reviews, 1);
    assert.equal(calls, pack.sources.length + 2);
    assert.match(failed.error!, /Content review timed out/);
    assert.match(failed.error!, /no automatic retry/);
    assert.equal(JSON.stringify(failed).includes('private-review-timeout-payload'), false);
  });
});
