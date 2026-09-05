import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { advanceRun, createRevisionRun, createRun, createRunTools } from '../lib/agent';
import { getConfig } from '../lib/config';
import { createModelReviewer, scriptedContentReviewer, type ContentReviewInput } from '../lib/content-review';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief, Material } from '../lib/types';
import { managementCookieName, managementIdentity } from '../lib/workshop-management';
import { POST as reviseRoute } from '../app/api/runs/[id]/revise/route';

const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const brief: Brief = { audience: 'Eight experienced facilitators', objective: 'Choose an experiment and assign its review owner.', durationMinutes: 30, constraints: 'Use breakout pairs.', format: 'remote' };
const updatedBrief: Brief = { audience: 'Four first-time workshop participants', objective: 'Complete an experiment card and identify an unresolved assumption.', durationMinutes: 60, constraints: 'Use paper cards and explain all specialist terminology.', format: 'in-person' };
const originalMaterials: Material[] = [{ id: 'old-guide', title: 'Original workshop guide', content: 'Workshop participants choose a reversible experiment and identify the review owner.', kind: 'text' }];
const selectedMaterials: Material[] = [{ id: 'current-guide', title: 'Updated workshop guide', content: 'Workshop participants write a proposed experiment card, name its human review point and record an unresolved assumption.', kind: 'text' }];
const feedback = 'Preserve useful content and regenerate for the edited brief.';
const toolContext = { toolCallId: 'scripted-tool-call', messages: [], context: {} };

async function fixture(t: TestContext, work: (store: LocalRunStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-brief-revision-'));
  const previousDirectory = process.cwd();
  const previousEnvironment = process.env;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network access is forbidden in brief revision tests.'); });
  try {
    process.chdir(directory);
    process.env = { NODE_ENV: 'test', WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' };
    await work(new LocalRunStore(), path.join(directory, '.local', 'runs'));
  } finally {
    process.chdir(previousDirectory);
    process.env = previousEnvironment;
    await rm(directory, { recursive: true, force: true });
  }
}

async function completedRun(store: LocalRunStore) {
  const run = await createRun(brief, store, config, originalMaterials, 'original-owner');
  run.displayName = 'Facilitator planning';
  run.pack = createTestPack(brief, { materials: originalMaterials });
  run.status = 'completed';
  run.clarificationResponse = { question: 'What level of workshop experience should we assume?', answer: 'Experienced facilitators working remotely in breakout pairs.' };
  await store.save(run);
  return run;
}

test('edited brief and materials stay isolated in the same workshop and drive validation and review', async t => fixture(t, async store => {
  const original = await completedRun(store);
  const originalBefore = JSON.stringify(await store.read(original.id));
  const submittedBrief = structuredClone(updatedBrief);
  const submittedMaterials = structuredClone(selectedMaterials);
  const revised = await createRevisionRun(original, feedback, store, config, 'current-owner', submittedMaterials, submittedBrief);
  assert.notEqual(revised.id, original.id);
  assert.equal(revised.workshopId, original.workshopId);
  assert.equal(revised.parentRunId, original.id);
  assert.equal(revised.displayName, original.displayName);
  assert.equal(revised.managementHash, 'current-owner');
  assert.deepEqual(revised.brief, updatedBrief);
  assert.deepEqual(revised.materials, selectedMaterials);
  assert.deepEqual(revised.revisionContext?.parentPack, original.pack);
  assert.equal(revised.clarificationResponse, undefined, 'An old answer must not reinstate a changed audience or constraint.');
  assert.equal(revised.pack, undefined);
  assert.equal(revised.contentReview, undefined);
  assert.deepEqual(revised.readSourceIds, []);
  assert.match(revised.messages[0].content as string, /current brief is authoritative for audience, objective, duration, constraints and format/);
  assert.match(revised.messages[0].content as string, /preservation feedback would retain incompatible old requirements/);
  submittedBrief.durationMinutes = 90;
  submittedMaterials[0].content = 'Caller edited this material after the revision was created.';
  original.brief.objective = 'Caller changed the original brief after revision creation.';
  assert.deepEqual(revised.brief, updatedBrief);
  assert.deepEqual(revised.materials, selectedMaterials);
  assert.equal(JSON.stringify(await store.read(revised.id)), JSON.stringify(revised));

  revised.status = 'running';
  await store.save(revised);
  const reviews: ContentReviewInput[] = [];
  const reviewModel = new MockLanguageModelV4({ doGenerate: async ({ prompt }) => {
    const system = prompt.find(message => message.role === 'system');
    assert.ok(system?.content.includes('The current brief is authoritative for the audience, objective, duration, format and constraints.'));
    assert.ok(system?.content.includes('preservation requests must not restore old requirements that conflict with the current brief'));
    assert.ok(system?.content.includes('Changes necessary to meet the edited brief are requested changes.'));
    const user = prompt.find(message => message.role === 'user');
    const part = user?.content.find(item => item.type === 'text');
    assert.ok(part && part.type === 'text');
    const input = JSON.parse(part.text) as ContentReviewInput;
    reviews.push(input);
    // Scripted assessment verifies the real reviewer request contract, not model judgment.
    return {
      content: [{ type: 'text', text: JSON.stringify({ ...await scriptedContentReviewer(input), sourceClaimReviews: (input.pack.sourceClaims ?? []).map((_, index) => ({ index, supported: true, reason: 'Scripted evidence coverage fixture; no semantic judgment is claimed.' })) }) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } },
      warnings: [],
    };
  } });
  const tools = createRunTools(revised, store, { reviewer: createModelReviewer(reviewModel, 1000) });
  await tools.read_material.execute!({ id: selectedMaterials[0].id }, toolContext);
  await tools.draft_pack.execute!({ pack: createTestPack(brief, { materials: selectedMaterials }) }, toolContext);
  await tools.validate_pack.execute!({}, toolContext);
  assert.equal(revised.validation?.valid, false);
  assert.match(revised.validation!.issues.join(' '), /totals 30 minutes; must equal the brief's 60 minutes/);
  assert.equal(reviews.length, 0, 'Old duration cannot reach content review.');
  await tools.draft_pack.execute!({ pack: createTestPack(updatedBrief, { materials: selectedMaterials }) }, toolContext);
  await tools.validate_pack.execute!({}, toolContext);
  assert.equal(revised.status, 'completed');
  assert.equal(revised.validation?.totalMinutes, 60);
  assert.equal(reviews.length, 1);
  assert.deepEqual(reviews[0].brief, updatedBrief);
  assert.deepEqual(reviews[0].materials, selectedMaterials);
  assert.deepEqual(reviews[0].parentPack, original.pack);
  assert.equal(reviews[0].clarificationResponse, undefined);
  assert.equal(reviews[0].feedback, feedback);
  assert.equal(JSON.stringify(await store.read(original.id)), originalBefore);
}));

test('clearing format on an edited brief pauses for a fresh format and resumes without the prior answer', async t => fixture(t, async store => {
  const original = await completedRun(store);
  const originalBefore = JSON.stringify(await store.read(original.id));
  const revised = await createRevisionRun(original, feedback, store, config, undefined, undefined, { ...updatedBrief, format: '' });
  const paused = await advanceRun(revised.id, store, undefined, { config });
  assert.equal(paused.status, 'awaiting_input');
  assert.equal(paused.clarification?.key, 'format');
  assert.equal(paused.brief.format, '');
  assert.equal(paused.clarificationResponse, undefined);
  assert.equal(paused.pack, undefined);
  assert.deepEqual(paused.readSourceIds, []);
  assert.deepEqual(paused.events.map(event => event.tool), ['ask_missing_info']);
  const completed = await advanceRun(revised.id, store, 'hybrid', { config, reviewer: async input => {
    assert.equal(input.brief.format, 'hybrid');
    assert.equal(input.brief.durationMinutes, 60);
    assert.equal(input.clarificationResponse, undefined);
    return scriptedContentReviewer(input);
  } });
  assert.equal(completed.status, 'completed', completed.error ?? 'The scripted workflow should complete.');
  assert.equal(completed.brief.format, 'hybrid');
  assert.equal(completed.workshopId, original.workshopId);
  assert.equal(JSON.stringify(await store.read(original.id)), originalBefore);
}));

test('omitted or unchanged briefs retain existing feedback and source-revision semantics', async t => fixture(t, async store => {
  const original = await completedRun(store);
  const originalBefore = JSON.stringify(await store.read(original.id));
  const feedbackOnly = await createRevisionRun(original, feedback, store, config);
  const sourcesOnly = await createRevisionRun(original, feedback, store, config, undefined, selectedMaterials);
  const unchangedBrief = await createRevisionRun(original, feedback, store, config, undefined, undefined, { ...brief });
  for (const revision of [feedbackOnly, sourcesOnly, unchangedBrief]) {
    assert.deepEqual(revision.brief, brief);
    assert.deepEqual(revision.clarificationResponse, original.clarificationResponse);
    assert.equal(revision.feedback, feedback);
    assert.equal(revision.workshopId, original.workshopId);
  }
  assert.deepEqual(feedbackOnly.materials, originalMaterials);
  assert.deepEqual(sourcesOnly.materials, selectedMaterials);
  assert.equal(JSON.stringify(await store.read(original.id)), originalBefore);
}));

test('revision API forwards a full edited brief and rejects invalid briefs without creating records', async t => fixture(t, async (store, directory) => {
  const original = await completedRun(store);
  const originalBefore = JSON.stringify(await store.read(original.id));
  const origin = 'http://127.0.0.1:3210';
  const cookie = `${managementCookieName}=${'c'.repeat(43)}`;
  const post = (body: unknown) => reviseRoute(new Request(`${origin}/api/runs/${original.id}/revise`, {
    method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: original.id }) });
  const response = await post({ feedback, materials: selectedMaterials, brief: updatedBrief });
  assert.equal(response.status, 201);
  const visible = (await response.json()).run;
  assert.deepEqual(visible.brief, updatedBrief);
  assert.deepEqual(visible.materials, selectedMaterials);
  assert.equal(visible.workshopId, original.workshopId);
  assert.equal(visible.displayName, original.displayName);
  const expectedOwner = managementIdentity(new Request(origin, { headers: { cookie } })).hash;
  assert.equal((await store.read(visible.id))?.managementHash, expectedOwner);
  assert.equal(visible.managementHash, undefined);
  const recordsBefore = (await readdir(directory)).sort();
  const invalidBriefs = [
    {}, null, { ...updatedBrief, durationMinutes: 29 }, { ...updatedBrief, durationMinutes: 60.5 },
    { ...updatedBrief, objective: 'tiny' }, { ...updatedBrief, format: 'video' }, { ...updatedBrief, extra: true },
  ];
  for (const invalid of invalidBriefs) {
    assert.equal((await post({ feedback, brief: invalid })).status, 400);
    await assert.rejects(() => createRevisionRun(original, feedback, store, config, undefined, undefined, invalid as Brief));
  }
  assert.deepEqual((await readdir(directory)).sort(), recordsBefore);
  assert.equal(JSON.stringify(await store.read(original.id)), originalBefore);
}));
