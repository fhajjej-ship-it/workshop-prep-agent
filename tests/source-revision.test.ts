import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { advanceRun, createRevisionRun, createRun, createRunTools } from '../lib/agent';
import { getConfig } from '../lib/config';
import { packHash, scriptedContentReviewer } from '../lib/content-review';
import { getRunMaterials } from '../lib/materials';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief, Material } from '../lib/types';
import { validatePack } from '../lib/validation';
import { managementCookieName } from '../lib/workshop-management';
import { POST as reviseRoute } from '../app/api/runs/[id]/revise/route';

const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const brief: Brief = { audience: 'Four workshop facilitators', objective: 'Choose a workshop experiment and identify its review owner.', durationMinutes: 30, constraints: 'Fictional inputs only.', format: 'remote' };
const originalMaterials: Material[] = [
  { id: 'team-guide', title: 'Team guide', content: 'Original workshop guidance: schedule the old checklist review with the former team lead.', kind: 'text' },
  { id: 'old-checklist', title: 'Old checklist', content: 'Original workshop checklist: record the old manual process and its previous review owner.', kind: 'pdf', filename: 'old-checklist.pdf', pageCount: 1 },
];
const replacementMaterials: Material[] = [
  { id: 'team-guide', title: 'Team guide', content: 'Updated workshop guidance: agree a reversible experiment and record the current human review owner.', kind: 'text' },
  { id: 'new-checklist', title: 'New checklist', content: 'Updated workshop checklist: record the proposed experiment, the approval point and its stop condition.', kind: 'pdf', filename: 'new-checklist.pdf', pageCount: 2 },
];
const feedback = 'Use the updated source guidance for the exercise and its worked answer.';

async function fixture(t: TestContext, work: (store: LocalRunStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-source-revision-'));
  const previousDirectory = process.cwd();
  const previousEnvironment = process.env;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network access is forbidden in source revision tests.'); });
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
  run.displayName = 'Team planning';
  run.pack = createTestPack(brief, { materials: originalMaterials });
  run.status = 'completed';
  run.revision = 2;
  run.readSourceIds = originalMaterials.map(source => source.id);
  run.validation = validatePack(run.pack, brief, run.readSourceIds, originalMaterials);
  run.contentReview = { status: 'passed', reviewedRevision: 2, reviewedPackHash: packHash(run.pack), mode: 'scripted', attempt: 2, issues: [], checks: (await scriptedContentReviewer({ brief, materials: originalMaterials, pack: run.pack })).checks };
  run.contentReviewCorrections = 1;
  run.clarificationResponse = { question: 'What output should the team record?', answer: 'One experiment card with a review owner.' };
  await store.save(run);
  return run;
}

test('source replacement creates an isolated revision with fresh evidence and caller ownership in the same family', async t => fixture(t, async store => {
  const original = await completedRun(store);
  const originalBefore = JSON.stringify(await store.read(original.id));
  const selected = structuredClone(replacementMaterials);
  const revised = await createRevisionRun(original, feedback, store, config, 'revision-owner', selected);
  assert.notEqual(revised.id, original.id);
  assert.equal(revised.workshopId, original.workshopId);
  assert.equal(revised.parentRunId, original.id);
  assert.equal(revised.displayName, original.displayName);
  assert.equal(revised.managementHash, 'revision-owner');
  assert.deepEqual(revised.materials, replacementMaterials);
  assert.deepEqual(revised.revisionContext?.parentPack, original.pack);
  assert.deepEqual(revised.clarificationResponse, original.clarificationResponse);
  assert.equal(revised.status, 'ready');
  assert.deepEqual(revised.readSourceIds, []);
  assert.deepEqual(revised.events, []);
  assert.equal(revised.steps, 0);
  assert.equal(revised.revision, 0);
  assert.equal(revised.contentReviewCorrections, 0);
  assert.equal(revised.contentReview, undefined);
  assert.equal(revised.validation, undefined);
  assert.equal(revised.pack, undefined);
  const prompt = revised.messages[0].content;
  assert.equal(typeof prompt, 'string');
  assert.match(prompt as string, /selected source snapshots have been replaced/);
  assert.match(prompt as string, /Only this revision's selected source snapshots are evidence/);
  assert.match(prompt as string, /previous pack is historical context, never source evidence/);
  assert.match(prompt as string, /older text under the same source ID/);
  selected[0].content = 'Caller mutation of the new source after saving the revision.';
  original.materials![0].content = 'Caller mutation of the original source after saving the revision.';
  original.pack!.title = 'Caller mutation of the original pack';
  original.clarificationResponse!.answer = 'Caller mutation of the original answer';
  assert.deepEqual(revised.materials, replacementMaterials);
  assert.equal(JSON.stringify(await store.read(original.id)), originalBefore);
  assert.deepEqual(await store.read(revised.id), revised);
}));

test('revision tools read current snapshots and reject removed citations and old quotes under retained IDs', async t => fixture(t, async store => {
  const original = await completedRun(store);
  const revised = await createRevisionRun(original, feedback, store, config, undefined, replacementMaterials);
  const currentPack = createTestPack(brief, { materials: replacementMaterials });
  assert.match(validatePack(currentPack, brief, revised.readSourceIds, getRunMaterials(revised)).issues.join(' '), /was not read/);
  revised.status = 'running';
  await store.save(revised);
  const tools = createRunTools(revised, store);
  await assert.rejects(async () => tools.read_material.execute!({ id: 'old-checklist' }, { toolCallId: 'removed-source', messages: [], context: {} }), /Unknown source ID/);
  assert.deepEqual(revised.readSourceIds, []);
  for (const source of replacementMaterials) {
    const read = await tools.read_material.execute!({ id: source.id }, { toolCallId: `read-${source.id}`, messages: [], context: {} });
    assert.deepEqual(read, { untrustedSourceContent: true, ...source });
  }
  assert.deepEqual(revised.readSourceIds, replacementMaterials.map(source => source.id));
  assert.equal(validatePack(currentPack, brief, revised.readSourceIds, getRunMaterials(revised)).valid, true);
  const oldReferences = validatePack(original.pack!, brief, revised.readSourceIds, getRunMaterials(revised));
  assert.equal(oldReferences.valid, false);
  assert.match(oldReferences.issues.join(' '), /unknown source old-checklist|Unknown declared source ID: old-checklist/);
  const staleQuote = structuredClone(currentPack);
  staleQuote.sourceClaims![0] = structuredClone(original.pack!.sourceClaims![0]);
  const checked = validatePack(staleQuote, brief, revised.readSourceIds, getRunMaterials(revised));
  assert.equal(checked.valid, false);
  assert.match(checked.issues.join(' '), /passage.*supplied source/i);
}));

test('a stopped source revision keeps its draft and current snapshots for feedback-only recovery without rewriting ancestors', async t => fixture(t, async store => {
  const original = await completedRun(store);
  const originalBefore = JSON.stringify(await store.read(original.id));
  const revised = await createRevisionRun(original, feedback, store, config, 'revision-owner', replacementMaterials);
  let reviews = 0;
  const stopped = await advanceRun(revised.id, store, undefined, { config, reviewer: async input => {
    reviews++;
    assert.deepEqual(input.materials, replacementMaterials);
    assert.deepEqual(input.parentPack, original.pack);
    assert.deepEqual(input.pack.sources, replacementMaterials.map(({ id, title }) => ({ id, title })));
    throw new Error('Scripted reviewer failure after a draft is saved.');
  } });
  assert.equal(reviews, 1);
  assert.equal(stopped.status, 'failed');
  assert.ok(stopped.pack);
  assert.equal(stopped.validation?.valid, true);
  assert.equal(stopped.contentReview, undefined);
  assert.ok(!stopped.events.some(event => event.tool === 'save_for_review'));
  assert.deepEqual(stopped.events.filter(event => event.tool === 'read_material' && event.status === 'ok').map(event => event.output), replacementMaterials.map(source => ({ untrustedSourceContent: true, ...source })));
  const stoppedBefore = JSON.stringify(await store.read(stopped.id));
  const recovery = await createRevisionRun(stopped, 'Finish reviewing the saved draft.', store, config);
  assert.equal(recovery.workshopId, original.workshopId);
  assert.equal(recovery.parentRunId, stopped.id);
  assert.deepEqual(recovery.materials, replacementMaterials, 'Feedback-only recovery retains the immediate parent snapshots.');
  assert.deepEqual(recovery.revisionContext?.parentPack, stopped.pack);
  assert.deepEqual(recovery.readSourceIds, []);
  assert.equal(recovery.contentReview, undefined);
  assert.equal(recovery.managementHash, undefined, 'The prior caller ownership is never silently inherited.');
  const originalFeedbackOnly = await createRevisionRun(original, 'Shorten the introduction.', store, config);
  assert.deepEqual(originalFeedbackOnly.materials, originalMaterials, 'Existing feedback-only calls keep their source snapshots.');
  assert.equal(JSON.stringify(await store.read(original.id)), originalBefore);
  assert.equal(JSON.stringify(await store.read(stopped.id)), stoppedBefore);
  const withoutDraft = { ...stopped, pack: undefined };
  await assert.rejects(() => createRevisionRun(withoutDraft, feedback, store, config, undefined, replacementMaterials), /saved or stopped workshop draft/);
}));

test('invalid replacement sets cannot create a revision record', async t => fixture(t, async (store, directory) => {
  const original = await completedRun(store);
  const recordsBefore = await readdir(directory);
  const originalBefore = JSON.stringify(await store.read(original.id));
  const source = replacementMaterials[0];
  const invalidSets = [
    [], [source, source], Array.from({ length: 4 }, (_, index) => ({ ...source, id: `source-${index}` })),
    [{ ...source, content: 'x'.repeat(20_001) }],
    Array.from({ length: 3 }, (_, index) => ({ ...source, id: `source-${index}`, content: 'x'.repeat(14_000) })),
    [{ ...source, id: 'INVALID ID' }],
  ];
  for (const selected of invalidSets) await assert.rejects(() => createRevisionRun(original, feedback, store, config, undefined, selected));
  assert.deepEqual(await readdir(directory), recordsBefore);
  assert.equal(JSON.stringify(await store.read(original.id)), originalBefore);
}));

test('revision API accepts bounded replacement material bodies, validates optional materials and preserves caller identity', async t => fixture(t, async (store, directory) => {
  const original = await completedRun(store);
  const originalBefore = JSON.stringify(await store.read(original.id));
  const origin = 'http://127.0.0.1:3210';
  const callerToken = 'b'.repeat(43);
  const callerHash = createHash('sha256').update(callerToken).digest('hex');
  const post = (body: unknown) => reviseRoute(new Request(`${origin}/api/runs/${original.id}/revise`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', cookie: `${managementCookieName}=${callerToken}` }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: original.id }) });
  const selected = replacementMaterials.map(source => ({ ...source, content: 'Workshop text with line breaks.\n'.repeat(650).slice(0, 20_000) }));
  assert.ok(JSON.stringify({ feedback, materials: selected }).length > 16_000);
  const response = await post({ feedback, materials: selected });
  assert.equal(response.status, 201);
  const visible = (await response.json()).run;
  assert.deepEqual(visible.materials, selected);
  assert.equal(visible.workshopId, original.workshopId);
  assert.equal(visible.parentRunId, original.id);
  assert.equal(visible.managementHash, undefined);
  assert.equal(visible.messages, undefined);
  assert.equal((await store.read(visible.id))?.managementHash, callerHash);
  const feedbackOnly = await post({ feedback });
  assert.equal(feedbackOnly.status, 201);
  assert.deepEqual((await feedbackOnly.json()).run.materials, originalMaterials);
  const recordsBefore = (await readdir(directory)).sort();
  for (const materials of [[], null, {}, [replacementMaterials[0], replacementMaterials[0]]]) {
    assert.equal((await post({ feedback, materials })).status, 400);
  }
  assert.equal((await post({ feedback, materials: selected, unrecognized: true })).status, 400);
  assert.equal((await post({ feedback, materials: [{ ...replacementMaterials[0], content: 'x'.repeat(250_000) }] })).status, 413);
  assert.deepEqual((await readdir(directory)).sort(), recordsBefore);
  assert.equal(JSON.stringify(await store.read(original.id)), originalBefore);
}));
