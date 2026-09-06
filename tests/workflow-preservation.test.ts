import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { advanceRun, createRevisionRun, createRun } from '../lib/agent';
import { getConfig } from '../lib/config';
import { createModelReviewer, hasCurrentContentReview, packHash, scriptedContentReviewer, type ContentReviewInput } from '../lib/content-review';
import { materials } from '../lib/materials';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief } from '../lib/types';
import { packSchema, validatePack } from '../lib/validation';
import { GET as downloadRoute } from '../app/api/runs/[id]/download/route';

const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const brief: Brief = { audience: 'Eight workshop facilitators', objective: 'Create one concrete experiment card and name its review owner.', durationMinutes: 30, constraints: 'Fictional input only.', format: 'remote' };

test('exercise duration must fit its explicitly linked agenda section', () => {
  const pack = createTestPack(brief);
  const readIds = materials.map(source => source.id);
  const index = pack.exercise.agendaSectionIndex!;
  assert.equal(validatePack(pack, brief, readIds).valid, true);
  pack.exercise.durationMinutes = pack.agenda[index].minutes + 1;
  assert.ok(pack.exercise.durationMinutes <= brief.durationMinutes, 'Total workshop time alone would accept this exercise.');
  assert.match(validatePack(pack, brief, readIds).issues.join(' '), /duration exceeds its linked agenda section/);
  pack.exercise.durationMinutes = pack.agenda[index].minutes;
  assert.equal(validatePack(pack, brief, readIds).valid, true, 'An exercise may fill the exact slot.');
  for (const invalidIndex of [undefined, -1, 0.5, pack.agenda.length]) {
    pack.exercise.agendaSectionIndex = invalidIndex;
    const result = validatePack(pack, brief, readIds);
    assert.equal(result.valid, false);
    assert.match(result.issues.join(' '), /existing agenda section/);
  }
});

test('a revision reviewer receives the persisted parent and rejects changing an agenda that feedback preserves', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-preservation-'));
  try {
    const store = new LocalRunStore(directory);
    const source = [materials[0]];
    const parent = await createRun(brief, store, config, source);
    parent.status = 'failed';
    parent.pack = createTestPack(brief, { materials: source });
    parent.pack.agenda[0].activity = 'Keep this original framing activity exactly as written: participants name the decision they will take away from the workshop.';
    await store.save(parent);
    const originalPack = structuredClone(parent.pack);
    const parentBefore = JSON.stringify(await store.read(parent.id));
    const feedback = 'Preserve the agenda exactly. Improve only the exercise sample response.';
    const child = await createRevisionRun(parent, feedback, store, config);
    parent.pack.agenda[0].activity = 'A caller mutation must not change the saved revision context.';
    assert.deepEqual(child.revisionContext?.parentPack, originalPack);
    assert.deepEqual((await new LocalRunStore(directory).read(child.id))?.revisionContext?.parentPack, originalPack);
    let reviews = 0;
    const reviewerModel = new MockLanguageModelV4({ doGenerate: async ({ prompt }) => {
      reviews++;
      const system = prompt.find(message => message.role === 'system');
      assert.ok(system?.content.includes('explicitly compare the proposed pack against parentPack'));
      assert.ok(system?.content.includes('reject unrequested changes'));
      const user = prompt.find(message => message.role === 'user');
      const text = user?.content.find(part => part.type === 'text');
      assert.ok(text && text.type === 'text');
      const payload = JSON.parse(text.text) as { evidenceSpans: { text: string; before?: string; after?: string }[] };
      const input = JSON.parse(JSON.stringify(payload), (_key, value) => value && typeof value === 'object' && Object.keys(value).length === 1 && Array.isArray(value.spans)
        ? value.spans.map((id: number) => { const span = payload.evidenceSpans[id]; return (span.before ?? '') + span.text + (span.after ?? ''); }).join('') : value) as ContentReviewInput & { artifactCandidates: { index: number; field: string }[]; evidenceSpans: { id: number; field: string }[] };
      assert.deepEqual(input.parentPack, originalPack);
      assert.equal(input.feedback, feedback);
      const assessment = await scriptedContentReviewer(input);
      const unchanged = JSON.stringify(input.parentPack!.agenda) === JSON.stringify(input.pack.agenda);
      assessment.checks.goal = { passed: unchanged, reason: unchanged ? 'The requested agenda is preserved.' : 'The draft changed the agenda even though the feedback requires preserving it.' };
      // Mutating reviewer input must not alter the stored parent snapshot.
      input.parentPack!.title = 'Reviewer-local mutation';
      return {
        content: [{ type: 'text', text: JSON.stringify({ ...assessment,
          participantInputReviews: input.materials.map((_, materialIndex) => ({ materialIndex, rules: [] })),
          standaloneDeliverableReviews: [],
          artifactReviews: input.artifactCandidates.map(({ index, field }) => ({ index, supported: [], mismatches: [], wordCounts: [], nonAssertions: [{ spans: input.evidenceSpans.filter(span => span.field === field).map(span => span.id), kind: 'design' }] })),
          sourceClaimReviews: (input.pack.sourceClaims ?? []).map((_, index) => ({
          index, supported: true, reason: 'Scripted source-coverage fixture; no semantic assessment is claimed.',
        })) }) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } },
        warnings: [],
      };
    } });
    const result = await advanceRun(child.id, new LocalRunStore(directory), undefined, { config, reviewer: createModelReviewer(reviewerModel, 1000) });
    assert.equal(reviews, 2, 'The scripted draft keeps making the unrequested change; review remains bounded.');
    assert.equal(result.status, 'failed');
    assert.equal(result.contentReview?.status, 'needs_revision');
    assert.match(result.contentReview?.issues.map(issue => issue.message).join(' ') ?? '', /changed the agenda/);
    assert.ok(!result.events.some(event => event.tool === 'save_for_review'));
    assert.deepEqual(result.revisionContext?.parentPack, originalPack);
    assert.equal(JSON.stringify(await store.read(parent.id)), parentBefore);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('completed legacy and v2 packs without an exercise link stay downloadable without rewriting saved data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-legacy-download-'));
  const previousDirectory = process.cwd();
  const previousEnvironment = process.env;
  try {
    process.chdir(directory);
    process.env = { NODE_ENV: 'test', WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' };
    const store = new LocalRunStore();
    for (const workflowVersion of [undefined, 2] as const) {
      const run = await createRun(brief, store, config);
      run.workflowVersion = workflowVersion;
      run.pack = createTestPack(brief);
      delete run.pack.exercise.agendaSectionIndex;
      assert.equal(packSchema.safeParse(run.pack).success, true, 'Stored schema remains backwards compatible.');
      assert.equal(validatePack(run.pack, brief, materials.map(source => source.id), materials, { requireDeliverableFields: false }).valid, true);
      run.status = 'completed';
      run.revision = 1;
      run.validation = { valid: true, totalMinutes: 30, issues: [] };
      if (workflowVersion === 2) run.contentReview = { status: 'passed', reviewedRevision: 1, reviewedPackHash: packHash(run.pack), mode: 'scripted', attempt: 1, issues: [], checks: (await scriptedContentReviewer({ brief, materials, pack: run.pack })).checks };
      await store.save(run);
      const before = JSON.stringify(await store.read(run.id));
      for (const format of ['md', 'json']) {
        const response = await downloadRoute(new Request(`http://localhost/api/runs/${run.id}/download?format=${format}`), { params: Promise.resolve({ id: run.id }) });
        assert.equal(response.status, 200);
        assert.ok((await response.text()).includes(run.pack.title));
      }
      assert.equal(JSON.stringify(await store.read(run.id)), before);
    }
  } finally {
    process.chdir(previousDirectory); process.env = previousEnvironment;
    await rm(directory, { recursive: true, force: true });
  }
});

test('pack fingerprints survive storage key reordering but reject content changes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-hash-order-'));
  try {
    const store = new LocalRunStore(directory);
    const run = await createRun(brief, store, config);
    run.pack = createTestPack(brief);
    run.status = 'completed';
    run.revision = 1;
    run.validation = { valid: true, totalMinutes: brief.durationMinutes, issues: [] };
    const checks = (await scriptedContentReviewer({ brief, materials, pack: run.pack })).checks;
    const schemaOrderedLegacyHash = createHash('sha256').update(JSON.stringify(packSchema.parse(run.pack))).digest('hex');
    assert.notEqual(schemaOrderedLegacyHash, packHash(run.pack), 'The fixture exercises the legacy fallback, not the stable hash path.');
    run.contentReview = { status: 'passed', reviewedRevision: 1, reviewedPackHash: schemaOrderedLegacyHash, mode: 'scripted', attempt: 1, checks, issues: [] };
    const reorderKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reorderKeys)
      : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, item]) => [key, reorderKeys(item)])) : value;
    run.pack = reorderKeys(run.pack) as typeof run.pack;
    assert.equal(hasCurrentContentReview(run), true, 'Schema-order legacy fingerprint accepts JSONB-style key reordering.');
    run.pack!.outcome += ' This text was added after review.';
    assert.equal(hasCurrentContentReview(run), false, 'A real content change invalidates the review.');
    run.contentReview.reviewedPackHash = '0'.repeat(64);
    assert.equal(hasCurrentContentReview(run), false, 'An unrelated present fingerprint still fails closed.');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
