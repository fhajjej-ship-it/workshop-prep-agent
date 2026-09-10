import assert from 'node:assert/strict';
import test from 'node:test';
import { canEditWorkshop, editedWorkshopFeedback, loadPendingWorkshopRevision, parseWorkshopDrafts, pendingWorkshopRevision, workshopBriefDraft, workshopDraftKey, workshopLocation, workshopPath, workshopPreparationRequest } from '../lib/workshop-navigation';
import { rememberRecentRun } from '../lib/recent-runs';
import type { Brief, PublicRun } from '../lib/types';

const originalId = '11111111-1111-4111-8111-111111111111';
const childId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const brief: Brief = { audience: 'Six new facilitators', objective: 'Practice one source-backed workshop decision.', durationMinutes: 45, constraints: 'Remote practice', format: 'remote' };
const material = { id: 'source-policy', title: 'Original policy', content: 'This is the original source material for the workshop.', kind: 'text' as const };
const pack = { title: 'Decision practice', outcome: brief.objective, agenda: [], exercise: { title: 'Practice', instructions: [], debrief: [], sourceIds: [] }, facilitatorNotes: [], sources: [] };
const original: PublicRun = { id: originalId, workshopId: originalId, createdAt: '2026-09-05T10:00:00Z', updatedAt: '2026-09-05T10:00:00Z', status: 'completed', mode: 'test', model: null, brief, materials: [material], pack, steps: 1, revision: 1, events: [], readSourceIds: [], version: 1 };

test('new briefs, edits and saved packs have distinct round-trippable routes', () => {
  for (const location of [{ view: 'home' }, { view: 'brief' }, { view: 'brief', runId: originalId }, { view: 'workshop', runId: originalId }] as const) {
    assert.deepEqual(workshopLocation(workshopPath(location).slice(1)), location);
  }
  assert.equal(workshopPath({ view: 'brief', runId: originalId }), `/?view=brief&run=${originalId}`);
  assert.deepEqual(workshopLocation('?view=brief&run=invalid'), { view: 'brief' });
  assert.deepEqual(workshopLocation(`?run=${originalId}`), { view: 'workshop', runId: originalId });
});

test('example briefs have their own route and cannot redirect a saved workshop edit', () => {
  const example = { view: 'brief', example: 'ai-adoption' } as const;
  assert.deepEqual(workshopLocation(workshopPath(example).slice(1)), example);
  assert.deepEqual(workshopLocation('?view=brief&example=unknown'), { view: 'brief' });
  assert.deepEqual(workshopLocation(`?view=brief&example=ai-adoption&run=${originalId}`), { view: 'brief', runId: originalId });
});

test('trying an example preserves unrelated drafts and submits a fresh preparation', () => {
  const existing = workshopBriefDraft(brief, [material]);
  const example = workshopBriefDraft({ ...brief, audience: 'Nine fictional leaders' }, [material]);
  const exampleKey = workshopDraftKey(null, 'ai-adoption');
  const drafts = parseWorkshopDrafts(JSON.stringify({ new: existing, [originalId]: existing, [exampleKey]: example }));
  assert.deepEqual(drafts.new, existing);
  assert.deepEqual(drafts[originalId], existing);
  assert.deepEqual(drafts[exampleKey], example);
  drafts[exampleKey].brief.audience = 'Edited audience';
  assert.equal(drafts.new.brief.audience, brief.audience);
  const request = workshopPreparationRequest(drafts[exampleKey]);
  assert.equal(request.url, '/api/runs');
  assert.equal(request.body.brief.audience, 'Edited audience');
  assert.deepEqual(Object.keys(request.body).sort(), ['brief', 'materials']);
  delete drafts[exampleKey];
  assert.deepEqual(drafts.new, existing);
  assert.deepEqual(drafts[originalId], existing);
});

test('new and edit drafts restore separately, including removed materials and unadded text', () => {
  const draft = workshopBriefDraft(brief, [material]);
  const edit = workshopBriefDraft({ ...brief, durationMinutes: 60 }, []);
  edit.feedback = 'Use the new audience and duration.';
  edit.textDraft = { title: 'Unadded replacement', content: 'A pasted reference still being edited.' };
  const drafts = { [workshopDraftKey()]: draft, [workshopDraftKey(originalId)]: edit };
  const restored = parseWorkshopDrafts(JSON.stringify(drafts));
  assert.deepEqual(restored.new, draft);
  assert.deepEqual(restored[originalId], edit);
  assert.deepEqual(restored[originalId].materials, [], 'A deliberately emptied selection must survive reload.');
  restored[originalId].brief.audience = 'Changed edited audience';
  assert.equal(restored.new.brief.audience, brief.audience);
  assert.equal(brief.durationMinutes, 45);
  assert.equal(original.materials?.[0].title, 'Original policy');
  assert.deepEqual(parseWorkshopDrafts('{broken'), {});
  assert.deepEqual(parseWorkshopDrafts(JSON.stringify({ unrelated: draft, [otherId]: { ...draft, materials: [{ content: 'bad' }] } })), {});
});

test('legacy source-editor input migrates without replacing the saved brief or losing feedback', () => {
  const changed = { ...material, id: 'source-replacement', title: 'Replacement policy' };
  const legacy = { feedback: 'Focus the exercise on these cases.', materials: [changed], textDraft: { title: 'Still typing', content: 'Unadded text remains available.' } };
  const migrated = workshopBriefDraft(brief, [material], JSON.stringify(legacy));
  assert.deepEqual(migrated.brief, brief);
  assert.equal(JSON.stringify(migrated.materials), JSON.stringify([changed]));
  assert.equal(migrated.feedback, legacy.feedback);
  assert.deepEqual(migrated.textDraft, legacy.textDraft);
  migrated.brief.audience = 'Edited audience';
  const migratedMaterial = migrated.materials.at(0);
  assert.ok(migratedMaterial);
  migratedMaterial.title = 'Edited title';
  assert.equal(brief.audience, original.brief.audience);
  assert.equal(material.title, 'Original policy');
  assert.deepEqual(workshopBriefDraft(brief, [material], '{broken').materials, [material]);
});

test('preparing an edit sends authoritative brief and materials to revise and retains one family card', () => {
  const draft = workshopBriefDraft({ ...brief, audience: 'Three senior facilitators', durationMinutes: 60 }, [{ ...material, content: 'This replacement policy is authoritative for the next version.' }]);
  const request = workshopPreparationRequest(draft, originalId);
  assert.equal(request.url, `/api/runs/${originalId}/revise`);
  assert.deepEqual(Object.keys(request.body).sort(), ['brief', 'feedback', 'materials']);
  assert.deepEqual(request.body.brief, draft.brief);
  assert.deepEqual(request.body.materials, draft.materials);
  assert.equal(request.body.feedback, editedWorkshopFeedback);
  assert.match(editedWorkshopFeedback, /edited brief and selected materials as authoritative/);
  assert.doesNotMatch(editedWorkshopFeedback, /Preserve the audience|Preserve.*timing/);
  const child: PublicRun = { ...original, id: childId, parentRunId: originalId, createdAt: '2026-09-05T11:00:00Z', updatedAt: '2026-09-05T11:00:00Z', brief: request.body.brief, materials: request.body.materials, status: 'ready', pack: undefined };
  const cards = rememberRecentRun(rememberRecentRun([], original), child);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, childId);
  assert.equal(cards[0].status, 'ready');
  assert.equal(original.brief.durationMinutes, 45);
  const fresh = workshopPreparationRequest(draft);
  assert.equal(fresh.url, '/api/runs');
  assert.deepEqual(Object.keys(fresh.body).sort(), ['brief', 'materials']);
  assert.throws(() => workshopPreparationRequest({ ...draft, textDraft: { title: 'Unadded', content: '' } }, originalId), /Add or discard/);
  assert.throws(() => workshopPreparationRequest({ ...draft, feedback: 'x' }, originalId), /at least 5/);
});

test('only terminal saved packs offer Step 1 editing and pending revisions remain discoverable', () => {
  for (const status of ['completed', 'failed'] as const) assert.equal(canEditWorkshop({ ...original, status }), true);
  for (const status of ['ready', 'running', 'awaiting_input'] as const) assert.equal(canEditWorkshop({ ...original, status }), false);
  assert.equal(canEditWorkshop({ ...original, status: 'failed', pack: undefined }), false);
  assert.equal(canEditWorkshop(null), false);
  const pending = { id: childId, originalId, parentId: originalId };
  for (const source of [undefined, originalId, childId]) assert.deepEqual(pendingWorkshopRevision(JSON.stringify(pending), source), pending);
  assert.equal(pendingWorkshopRevision(JSON.stringify(pending), otherId), null);
  assert.equal(pendingWorkshopRevision('{broken'), null);
  assert.equal(pendingWorkshopRevision(JSON.stringify({ id: 'invalid', originalId })), null);
});

test('a deleted pending attempt allows parent editing while an unreadable attempt does not create a competing run', async () => {
  const child: PublicRun = { ...original, id: childId, parentRunId: originalId, status: 'ready', pack: undefined };
  assert.equal(await loadPendingWorkshopRevision(childId, async id => { assert.equal(id, childId); return child; }), child);
  const missing = await loadPendingWorkshopRevision(childId, async () => { throw Object.assign(new Error('Run not found.'), { status: 404 }); });
  assert.equal(missing, null);
  assert.equal(canEditWorkshop(original), true);
  const unavailable = Object.assign(new Error('Store unavailable.'), { status: 503 });
  await assert.rejects(loadPendingWorkshopRevision(childId, async () => { throw unavailable; }), error => error === unavailable);
  await assert.rejects(loadPendingWorkshopRevision(childId, async () => { throw new Error('Network unavailable.'); }), /Network unavailable/);
});
