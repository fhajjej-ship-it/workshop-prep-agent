import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { advanceRun, createRevisionRun, createRun } from '../lib/agent';
import { getConfig } from '../lib/config';
import { scriptedContentReviewer, type ContentReviewInput } from '../lib/content-review';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief, WorkshopPack } from '../lib/types';

const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const brief: Brief = {
  audience: 'Four fictional product team members',
  objective: 'Agree responsibility owners during the workshop on 12 September 2026.',
  durationMinutes: 60,
  constraints: 'Use fictional case inputs and complete follow-ups by 15 September 2026.',
  format: 'remote',
};

async function withStore(action: (store: LocalRunStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(process.cwd(), '.local-test-drafting-context-'));
  try { await action(new LocalRunStore(directory), directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function captureDraftingContext(pack: WorkshopPack, needsFormat = false) {
  const calls = [
    ...(needsFormat ? [{ toolName: 'ask_missing_info', input: {} }] : []),
    ...pack.sources.map(source => ({ toolName: 'read_material', input: { id: source.id } })),
    { toolName: 'draft_pack', input: { pack } },
    { toolName: 'validate_pack', input: {} },
  ];
  const instructions: string[] = [];
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({ doGenerate: async ({ prompt }) => {
    instructions.push(prompt.filter(message => message.role === 'system').map(message => message.content).join('\n'));
    prompts.push(JSON.stringify(prompt));
    const call = calls.shift();
    assert.ok(call, 'A passing reviewed draft should finish without another model request.');
    return {
      content: [{ type: 'tool-call' as const, toolCallId: `context-${instructions.length}`, toolName: call.toolName, input: JSON.stringify(call.input) }],
      finishReason: { unified: 'tool-calls' as const, raw: undefined },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 0, text: 0, reasoning: undefined },
      },
      warnings: [],
    };
  } });
  return { model, instructions, prompts };
}

test('drafting and review share the saved creation date across a clarification resume and retain the explicit workshop date', async () => {
  await withStore(async (store, directory) => {
    const run = await createRun({ ...brief, format: '' }, store, config);
    run.createdAt = '2026-09-01T23:59:00.000Z';
    await store.save(run);
    const captured = captureDraftingContext(createTestPack(brief), true);
    const reviews: ContentReviewInput[] = [];
    const reviewer = async (input: ContentReviewInput) => {
      reviews.push(input);
      return scriptedContentReviewer(input);
    };

    const paused = await advanceRun(run.id, store, undefined, { config, model: captured.model, reviewer });
    assert.equal(paused.status, 'awaiting_input');
    const finished = await advanceRun(run.id, new LocalRunStore(directory), 'remote', { config, model: captured.model, reviewer });

    assert.equal(finished.status, 'completed', finished.error ?? 'Preparation should complete.');
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].referenceDate, '2026-09-01');
    assert.equal(reviews[0].brief.objective, brief.objective);
    assert.equal(finished.createdAt, run.createdAt);
    assert.ok(captured.instructions.length > 1);
    for (const instructions of captured.instructions) assert.match(instructions, /Preparation reference date: 2026-09-01/);
    for (const prompt of captured.prompts) assert.ok(prompt.includes(brief.objective));
  });
});

test('revision drafting and review use the new record date while preserving the explicit workshop date in feedback', async () => {
  await withStore(async store => {
    const original = await createRun(brief, store, config);
    original.createdAt = '2026-08-20T10:00:00.000Z';
    original.status = 'completed';
    original.pack = createTestPack(brief);
    await store.save(original);
    const feedback = 'Move the workshop to 14 September 2026 and keep the responsibility exercise.';
    const revision = await createRevisionRun(original, feedback, store, config);
    revision.createdAt = '2026-09-02T01:00:00.000Z';
    await store.save(revision);
    const captured = captureDraftingContext(original.pack);
    const reviews: ContentReviewInput[] = [];

    const finished = await advanceRun(revision.id, store, undefined, {
      config, model: captured.model, reviewer: async input => {
        reviews.push(input);
        return scriptedContentReviewer(input);
      },
    });

    assert.equal(finished.status, 'completed', finished.error ?? 'Revision should complete.');
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].referenceDate, '2026-09-02');
    assert.equal(reviews[0].feedback, feedback);
    assert.deepEqual(reviews[0].parentPack, original.pack);
    for (const instructions of captured.instructions) assert.match(instructions, /Preparation reference date: 2026-09-02/);
    for (const prompt of captured.prompts) assert.ok(prompt.includes(feedback));
  });
});
