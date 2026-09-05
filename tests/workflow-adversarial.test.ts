import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { advanceRun, createRevisionRun, createRun, createRunTools } from '../lib/agent';
import type { ContentReviewAssessment, ContentReviewer } from '../lib/content-review';
import { createModelReviewer, packHash } from '../lib/content-review';
import { getConfig } from '../lib/config';
import { materials } from '../lib/materials';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief } from '../lib/types';
import { validatePack } from '../lib/validation';

const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const brief: Brief = {
  audience: 'Eight workshop facilitators',
  objective: 'Leave with one completed experiment card and a clear review decision.',
  durationMinutes: 30,
  constraints: 'Use fictional examples and make the participant materials self-contained.',
  format: 'remote',
};

function assessment(passed = true): ContentReviewAssessment {
  return { checks: {
    goal: { passed: true, reason: 'Scripted assertion used to test review control flow only.' },
    audience: { passed: true, reason: 'Scripted assertion used to test review control flow only.' },
    constraints: { passed: true, reason: 'Scripted assertion used to test review control flow only.' },
    grounding: { passed: true, reason: 'Scripted assertion used to test review control flow only.' },
    completeness: { passed, reason: passed ? 'Scripted completeness pass.' : 'The required participant scenario is still missing.' },
  } };
}

async function withStore(fn: (store: LocalRunStore) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-adversarial-'));
  try { await fn(new LocalRunStore(directory)); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function toolsInOrder(calls: { name: string; input: unknown }[]) {
  let count = 0;
  return {
    model: new MockLanguageModelV4({ doGenerate: async () => {
      const call = calls[count++];
      if (!call) throw new Error('Unexpected extra generation after the terminal review.');
      return {
        content: [{ type: 'tool-call', toolCallId: randomUUID(), toolName: call.name, input: JSON.stringify(call.input) }],
        finishReason: { unified: 'tool-calls', raw: undefined },
        usage: { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } },
        warnings: [],
      };
    } }),
    count: () => count,
  };
}

test('a content-review rejection cannot become completion and corrections stay bounded', async () => withStore(async store => {
  const created = await createRun(brief, store, config, [materials[0]]);
  let reviews = 0;
  const reviewer: ContentReviewer = async () => { reviews++; return assessment(false); };
  const result = await advanceRun(created.id, store, undefined, { config, reviewer });
  assert.notEqual(result.status, 'completed');
  assert.equal(reviews, 2, 'There is one initial review and at most one correction review.');
  assert.equal(result.contentReview?.status, 'needs_revision');
  assert.ok(result.contentReview?.issues.some(issue => /scenario/.test(issue.message)));
  assert.equal(result.events.some(event => event.tool === 'save_for_review'), false);
}));

test('a reviewer exception cannot silently accept a structurally valid draft or expose its payload', async () => withStore(async store => {
  const created = await createRun(brief, store, config, [materials[0]]);
  let reviews = 0;
  const result = await advanceRun(created.id, store, undefined, { config, reviewer: async () => {
    reviews++;
    throw new Error('private-review-payload-with-source-content');
  } });
  assert.equal(reviews, 1, 'A failed review must not retry automatically.');
  assert.notEqual(result.status, 'completed');
  assert.notEqual(result.contentReview?.status, 'passed');
  assert.doesNotMatch(JSON.stringify(await store.read(created.id)), /private-review-payload/);
  assert.equal(result.events.some(event => event.tool === 'save_for_review'), false);
}));

test('an incomplete reviewer response cannot count as a content pass', async () => withStore(async store => {
  const created = await createRun(brief, store, config, [materials[0]]);
  let reviews = 0;
  const result = await advanceRun(created.id, store, undefined, { config, reviewer: async () => {
    reviews++;
    return { checks: { goal: { passed: true, reason: 'Only one criterion was returned.' } } } as unknown as ContentReviewAssessment;
  } });
  assert.equal(reviews, 1);
  assert.notEqual(result.status, 'completed');
  assert.notEqual(result.contentReview?.status, 'passed');
}));

test('validation followed by a passing review on the last available step finalizes without another model decision', async () => withStore(async store => {
  const chosen = [materials[0]];
  const created = await createRun(brief, store, config, chosen);
  const draft = createTestPack(brief, { materials: chosen });
  const scripted = toolsInOrder([
    { name: 'read_material', input: { id: chosen[0].id } },
    { name: 'draft_pack', input: { pack: draft } },
    { name: 'validate_pack', input: {} },
  ]);
  let reviews = 0;
  const result = await advanceRun(created.id, store, undefined, {
    config, model: scripted.model, maxSteps: 4,
    reviewer: async () => { reviews++; return assessment(); },
  });
  assert.equal(result.status, 'completed', result.error ?? 'Expected the scripted workflow state.');
  assert.equal(result.steps, 4);
  assert.equal(scripted.count(), 3);
  assert.equal(reviews, 1);
  assert.equal(result.contentReview?.reviewedRevision, result.revision);
  assert.equal(result.contentReview?.mode, 'scripted');
  assert.equal(result.events.at(-1)?.tool, 'save_for_review');
}));

test('exhausting the budget before review cannot finish, but the stopped draft can seed a revision', async () => withStore(async store => {
  const chosen = [materials[0]];
  const created = await createRun(brief, store, config, chosen);
  const scripted = toolsInOrder([
    { name: 'read_material', input: { id: chosen[0].id } },
    { name: 'draft_pack', input: { pack: createTestPack(brief, { materials: chosen }) } },
    { name: 'validate_pack', input: {} },
  ]);
  let reviews = 0;
  const result = await advanceRun(created.id, store, undefined, {
    config, model: scripted.model, maxSteps: 3, reviewer: async () => { reviews++; return assessment(); },
  });
  assert.equal(result.status, 'failed');
  assert.equal(reviews, 0);
  assert.ok(result.pack);
  assert.equal(result.contentReview, undefined);
  const before = JSON.stringify(await store.read(result.id));
  const revision = await createRevisionRun(result, 'Complete the missing review and improve the exercise.', store, config);
  assert.equal(revision.status, 'ready');
  assert.equal(revision.parentRunId, result.id);
  assert.equal(JSON.stringify(await store.read(result.id)), before);
}));

test('a review of an older draft cannot authorize saving a newer draft', async () => withStore(async store => {
  const chosen = [materials[0]];
  const run = await createRun(brief, store, config, chosen);
  run.status = 'running';
  run.pack = createTestPack(brief, { materials: chosen });
  run.readSourceIds = [chosen[0].id];
  run.revision = 2;
  run.validation = validatePack(run.pack, brief, run.readSourceIds, chosen);
  run.contentReview = {
    status: 'passed', reviewedRevision: 1, mode: 'scripted', attempt: 1,
    checks: assessment().checks, issues: [],
  };
  await store.save(run);
  const tools = createRunTools(run, store);
  await assert.rejects(async () => tools.save_for_review.execute!({}, { toolCallId: 'stale-review-attempt', messages: [], context: {} }), /review/i);
  assert.notEqual((await store.read(run.id))?.status, 'completed');
}));

test('changing a pack without incrementing its revision invalidates the review fingerprint', async () => withStore(async store => {
  const chosen = [materials[0]];
  const run = await createRun(brief, store, config, chosen);
  run.status = 'running';
  run.pack = createTestPack(brief, { materials: chosen });
  run.readSourceIds = [chosen[0].id];
  run.revision = 1;
  run.validation = validatePack(run.pack, brief, run.readSourceIds, chosen);
  run.contentReview = {
    status: 'passed', reviewedRevision: 1, reviewedPackHash: packHash(run.pack), mode: 'scripted', attempt: 1,
    checks: assessment().checks, issues: [],
  };
  run.pack.outcome = 'This different participant outcome has never been examined by the content reviewer.';
  await store.save(run);
  const tools = createRunTools(run, store);
  await assert.rejects(async () => tools.save_for_review.execute!({}, { toolCallId: 'changed-pack-attempt', messages: [], context: {} }), /review/i);
  assert.notEqual((await store.read(run.id))?.status, 'completed');
}));

test('the model-review adapter requires every criterion and makes no automatic retry', async () => {
  let requests = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    requests++;
    return {
      content: [{ type: 'text', text: JSON.stringify({ checks: { goal: { passed: true, reason: 'Other criteria are absent.' } } }) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } },
      warnings: [],
    };
  } });
  await assert.rejects(() => createModelReviewer(model, 1000)({ brief, materials, pack: createTestPack(brief) }));
  assert.equal(requests, 1);
});

test('the reviewer receives exact source snapshots, original goal and concrete exercise material', async () => withStore(async store => {
  const source = { id: 'synthetic-delivery-note', title: 'Synthetic delivery note', content: 'A fictional team reviews an invented weekly summary. A facilitator records a decision and one review owner.', kind: 'text' as const };
  const run = await createRun(brief, store, config, [source]);
  let reviewInput: Parameters<ContentReviewer>[0] | undefined;
  const result = await advanceRun(run.id, store, undefined, { config, reviewer: async input => {
    reviewInput = structuredClone(input);
    return assessment();
  } });
  assert.equal(result.status, 'completed', result.error ?? 'Expected the scripted workflow state.');
  assert.deepEqual(reviewInput?.brief, brief);
  assert.deepEqual(reviewInput?.materials, [source]);
  for (const field of ['scenario', 'expectedOutput', 'sampleResponse'] as const) {
    assert.ok(reviewInput?.pack.exercise[field]?.trim(), `Reviewer must receive the exercise ${field}.`);
  }
  assert.ok((reviewInput?.pack.exercise.durationMinutes ?? 0) > 0);
  assert.equal(result.contentReview?.status, 'passed');
}));

test('missing exercise inputs and fabricated supporting passages are rejected before content review', () => {
  const chosen = [materials[0]];
  const pack = createTestPack(brief, { materials: chosen });
  const missing = structuredClone(pack);
  delete missing.exercise.scenario;
  delete missing.exercise.expectedOutput;
  delete missing.exercise.sampleResponse;
  delete missing.exercise.durationMinutes;
  const result = validatePack(missing, brief, [chosen[0].id], chosen);
  assert.equal(result.valid, false);
  for (const pattern of [/scenario/i, /expected output/i, /sample response/i, /duration/i]) assert.match(result.issues.join(' '), pattern);
  const forged = structuredClone(pack);
  forged.sourceClaims = [{ claim: 'This fictional claim is included only to test a fabricated quotation.', sourceId: chosen[0].id, quote: 'This supporting passage does not occur anywhere in the selected material.' }];
  const forgedResult = validatePack(forged, brief, [chosen[0].id], chosen);
  assert.equal(forgedResult.valid, false);
  assert.match(forgedResult.issues.join(' '), /passage.*supplied source/i);
});

test('a feedback revision preserves the original pack and exact sources, including after caller mutation', async () => withStore(async store => {
  const source = { id: 'revision-source', title: 'Revision source', content: 'A fictional team reviews a weekly summary and records a practical decision with a named review owner.', kind: 'text' as const };
  const first = await createRun(brief, store, config, [source]);
  const parent = await advanceRun(first.id, store, undefined, { config, reviewer: async () => assessment() });
  assert.equal(parent.status, 'completed', parent.error ?? 'Expected the scripted workflow state.');
  const before = JSON.stringify(await store.read(parent.id));
  const child = await createRevisionRun(parent, 'Make the exercise easier to facilitate and preserve the goal.', store, config);
  assert.notEqual(child.id, parent.id);
  assert.equal(child.parentRunId, parent.id);
  assert.equal(child.status, 'ready');
  assert.deepEqual(child.materials, [source]);
  assert.equal(child.contentReview, undefined, 'A parent review cannot authorize the new revision.');
  parent.materials![0].content = 'Caller changed this source after the revision was created.';
  assert.equal(child.materials?.[0].content, source.content);
  assert.equal(JSON.stringify(await store.read(parent.id)), before);
  let seenFeedback = '';
  const revised = await advanceRun(child.id, store, undefined, { config, reviewer: async input => {
    seenFeedback = input.feedback ?? '';
    return assessment();
  } });
  assert.equal(revised.status, 'completed', revised.error ?? 'Expected the scripted workflow state.');
  assert.match(seenFeedback, /easier to facilitate/);
  assert.equal(JSON.stringify(await store.read(parent.id)), before, 'Generating the child must never overwrite the parent.');
}));

test('empty and oversized feedback cannot create a revision', async () => withStore(async store => {
  const created = await createRun(brief, store, config, [materials[0]]);
  const parent = await advanceRun(created.id, store, undefined, { config, reviewer: async () => assessment() });
  assert.equal(parent.status, 'completed', parent.error ?? 'Expected the scripted workflow state.');
  for (const feedback of ['', '    ', 'tiny', 'x'.repeat(2001)]) {
    await assert.rejects(() => createRevisionRun(parent, feedback, store, config));
  }
}));

test('a targeted clarification persists and invalid answers cannot resume it', async () => withStore(async store => {
  const created = await createRun(brief, store, config, [materials[0]]);
  const question = 'Should participants leave with an experiment card or a supplier comparison?';
  const planner = toolsInOrder([{ name: 'ask_clarification', input: { question } }]);
  const paused = await advanceRun(created.id, store, undefined, { config, model: planner.model });
  assert.equal(paused.status, 'awaiting_input', paused.error ?? 'Expected the scripted workflow state.');
  assert.deepEqual(paused.clarification, { key: 'detail', question });
  const before = JSON.stringify(await store.read(paused.id));
  for (const answer of ['  ', 'x'.repeat(1201)]) {
    await assert.rejects(() => advanceRun(paused.id, store, undefined, { config, answer }));
    assert.equal(JSON.stringify(await store.read(paused.id)), before);
  }
  const complete = await advanceRun(paused.id, store, undefined, { config, answer: '  One completed experiment card.  ', reviewer: async input => {
    assert.deepEqual(input.clarificationResponse, { question, answer: 'One completed experiment card.' });
    return assessment();
  } });
  assert.equal(complete.status, 'completed', complete.error ?? 'Expected the scripted workflow state.');
  assert.equal(complete.clarificationUsed, true);
  assert.equal(complete.clarification, undefined);
}));
