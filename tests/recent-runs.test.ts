import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrateRecentRuns, parseRecentRuns, preferredRunId, recentRunSummary, rememberRecentRun, removeRecentWorkshop, workshopFamilyId } from '../lib/recent-runs';
import type { PublicRun } from '../lib/types';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const thirdId = '33333333-3333-4333-8333-333333333333';
const fourthId = '44444444-4444-4444-8444-444444444444';
const summaryKeys = ['createdAt', 'id', 'revised', 'status', 'title', 'updatedAt', 'workshopId'];

function run(id: string, title: string, updatedAt: string, parentRunId?: string): PublicRun {
  return {
    id, createdAt: updatedAt, updatedAt, status: 'completed', mode: 'test', model: null,
    brief: { audience: 'Private audience', objective: 'Private objective', durationMinutes: 30, constraints: '', format: 'remote' },
    materials: [{ id: 'private-source', title: 'Private source', content: 'Private source content' }],
    pack: { title, outcome: 'Private outcome', agenda: [], exercise: { title: 'Exercise', instructions: [], debrief: [], sourceIds: [] }, facilitatorNotes: [], sources: [] },
    validation: { valid: true, totalMinutes: 30, issues: [] }, events: [], steps: 1, revision: 1, readSourceIds: [], version: 1,
    parentRunId,
  };
}

test('recent workshop history stays bounded, ordered and free of workshop contents', () => {
  let recent = rememberRecentRun([], run(firstId, 'First workshop', '2026-09-04T10:00:00.000Z'), 2);
  recent = rememberRecentRun(recent, run(secondId, 'Second workshop', '2026-09-04T11:00:00.000Z'), 2);
  recent = rememberRecentRun(recent, run(thirdId, 'Third workshop', '2026-09-04T12:00:00.000Z'), 2);
  assert.deepEqual(recent.map(item => item.id), [thirdId, secondId]);
  assert.equal(recent[0].title, 'Third workshop');
  assert.equal(recent[0].revised, false);
  assert.deepEqual(Object.keys(recent[0]).sort(), summaryKeys);
  const serialized = JSON.stringify(recent);
  for (const privateValue of ['Private audience', 'Private objective', 'Private source', 'Private source content', 'Private outcome']) {
    assert.ok(!serialized.includes(privateValue));
  }
  assert.deepEqual(parseRecentRuns(serialized, 2), recent);
  assert.equal(parseRecentRuns(JSON.stringify([{ ...recent[1], revised: undefined }]))[0].revised, false, 'Older browser history migrates without being discarded.');
});

test('run links take precedence over the legacy current run and malformed history is ignored', () => {
  assert.equal(preferredRunId(`?run=${secondId}`, firstId), secondId);
  assert.equal(preferredRunId('?run=not-a-run', firstId), firstId);
  assert.equal(preferredRunId('', firstId), firstId);
  assert.equal(preferredRunId('', 'not-a-run'), null);
  assert.deepEqual(parseRecentRuns('{broken'), []);
  assert.deepEqual(parseRecentRuns(JSON.stringify([{ id: 'not-a-run', title: 'Invalid', updatedAt: 'today', status: 'completed' }])), []);
});

test('a library rename survives history restoration without changing the workshop pack', () => {
  const saved = run(firstId, 'Original pack title', '2026-09-05T08:00:00.000Z');
  saved.displayName = 'September leadership session';
  const recent = parseRecentRuns(JSON.stringify(rememberRecentRun([], saved)));
  assert.equal(recent[0].title, 'September leadership session');
  assert.equal(saved.pack?.title, 'Original pack title');
  assert.deepEqual(Object.keys(recent[0]).sort(), summaryKeys);
});

test('a revision updates one family card through every state and opening an older version cannot downgrade it', () => {
  const original = run(firstId, 'Support triage', '2026-09-04T10:00:00Z');
  const child = { ...run(secondId, 'Support triage revised', '2026-09-04T11:00:00Z', firstId), workshopId: firstId };
  let recent = rememberRecentRun([], original);
  const states = ['ready', 'running', 'awaiting_input', 'failed', 'completed'] as const;
  for (const [index, status] of states.entries()) {
    recent = rememberRecentRun(recent, { ...child, status, updatedAt: `2026-09-04T11:0${index}:00Z` });
    assert.equal(recent.length, 1);
    assert.equal(recent[0].id, secondId);
    assert.equal(recent[0].status, status);
    assert.equal(recent[0].revised, true);
  }
  const grandchild = { ...run(thirdId, 'Newest triage attempt', '2026-09-04T12:00:00Z', secondId), workshopId: firstId, status: 'failed' as const };
  recent = rememberRecentRun(recent, grandchild);
  recent = rememberRecentRun(recent, { ...original, updatedAt: '2026-09-05T15:00:00Z', displayName: 'Renamed older original' });
  recent = rememberRecentRun(recent, { ...child, updatedAt: '2026-09-05T16:00:00Z' });
  assert.deepEqual(recent.map(item => [item.id, item.status, item.title]), [[thirdId, 'failed', 'Newest triage attempt']]);
  assert.equal(recent[0].createdAt, grandchild.createdAt);
});

test('preparation preserves the family title until a pack or explicit name replaces it', () => {
  const original = run(firstId, 'Support triage', '2026-09-04T10:00:00Z');
  const pending = { ...run(secondId, 'Unused pack title', '2026-09-04T11:00:00Z', firstId), pack: undefined, status: 'ready' as const };
  let recent = rememberRecentRun(rememberRecentRun([], original), pending);
  assert.equal(recent[0].title, 'Support triage');
  recent = rememberRecentRun(recent, { ...pending, status: 'running', updatedAt: '2026-09-04T11:01:00Z' });
  assert.equal(recent[0].title, 'Support triage');
  assert.equal(rememberRecentRun(recent, { ...pending, displayName: 'Named session' })[0].title, 'Support triage', 'An older response cannot overwrite the current status or title.');
  recent = rememberRecentRun(recent, { ...pending, displayName: 'Named session', updatedAt: '2026-09-04T11:02:00Z' });
  assert.equal(recent[0].title, 'Named session');
  recent = rememberRecentRun(recent, { ...run(secondId, 'New pack title', pending.createdAt, firstId), updatedAt: '2026-09-04T11:03:00Z' });
  assert.equal(recent[0].title, 'New pack title');
});

test('matching titles and briefs never combine independent workshops', () => {
  const original = run(firstId, 'Same title', '2026-09-04T10:00:00Z');
  const separate = run(fourthId, 'Same title', '2026-09-04T11:00:00Z');
  const child = { ...run(secondId, 'Same title', '2026-09-04T12:00:00Z', firstId), workshopId: firstId };
  const recent = rememberRecentRun(rememberRecentRun(rememberRecentRun([], original), separate), child);
  assert.deepEqual(recent.map(item => item.id), [secondId, fourthId]);
  assert.equal(new Set(recent.map(workshopFamilyId)).size, 2);
});

test('legacy history migrates linked ancestors together while unavailable records remain recoverable', () => {
  const original = { ...run(firstId, 'Old parent', '2026-09-04T10:00:00Z'), workshopId: firstId, updatedAt: '2026-09-05T20:00:00Z' };
  const child = { ...run(secondId, 'Old child', '2026-09-04T11:00:00Z', firstId), workshopId: firstId };
  const newest = { ...run(thirdId, 'Latest child', '2026-09-04T12:00:00Z', secondId), workshopId: firstId };
  const unavailable = run(fourthId, 'Unavailable separate workshop', '2026-09-04T09:00:00Z');
  const legacy = parseRecentRuns(JSON.stringify([original, child, newest, unavailable].map(saved => ({
    id: saved.id, title: saved.pack?.title, updatedAt: saved.updatedAt, status: saved.status, privateMaterial: 'Must not persist',
  }))));
  assert.equal(legacy.length, 4);
  assert.ok(legacy.every(item => item.revised === false));
  assert.ok(!JSON.stringify(legacy).includes('Must not persist'));
  const migrated = hydrateRecentRuns(legacy, [original, child, newest]);
  assert.deepEqual(migrated.map(item => item.id), [thirdId, fourthId]);
  assert.deepEqual(parseRecentRuns(JSON.stringify(migrated)), migrated);
  assert.equal(migrated[0].workshopId, firstId);
  assert.deepEqual(migrated[1], legacy[3]);
  const opened = rememberRecentRun(legacy, newest);
  assert.equal(opened.filter(item => item.id === thirdId).length, 1, 'Opening a legacy child replaces its pre-migration summary without duplicating the same run.');
});

test('raw legacy rename and progress responses preserve an already resolved family', () => {
  const grandchild = { ...run(thirdId, 'Latest child', '2026-09-04T12:00:00Z', secondId), workshopId: firstId };
  const recent = rememberRecentRun([], grandchild);
  const raw = { ...grandchild, workshopId: undefined, displayName: 'Renamed session', updatedAt: '2026-09-05T12:00:00Z' };
  assert.equal(recentRunSummary(raw, recent).workshopId, firstId);
  const renamed = rememberRecentRun(recent, raw);
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].title, 'Renamed session');
  assert.equal(renamed[0].workshopId, firstId);
  const progressing = rememberRecentRun(renamed, { ...raw, status: 'running', updatedAt: '2026-09-05T12:01:00Z' });
  assert.equal(progressing.length, 1);
  assert.equal(progressing[0].workshopId, firstId);
  assert.equal(progressing[0].status, 'running');
});

test('local removal clears the entire known family and a hidden-version pointer without touching other workshops or pack data', () => {
  const original = { ...run(firstId, 'Same title', '2026-09-04T10:00:00Z'), workshopId: firstId };
  const child = { ...run(secondId, 'Same title', '2026-09-04T11:00:00Z', firstId), workshopId: firstId };
  const newest = { ...run(thirdId, 'Same title', '2026-09-04T12:00:00Z', secondId), workshopId: firstId };
  const separate = run(fourthId, 'Same title', '2026-09-04T13:00:00Z');
  const current = [original, child, newest, separate].map(saved => recentRunSummary(saved));
  const before = JSON.stringify({ original, child, newest, separate, current });
  const removal = removeRecentWorkshop(current, newest, secondId, [child]);
  assert.deepEqual(removal.recent.map(item => item.id), [fourthId]);
  assert.equal(removal.clearCurrentRun, true);
  const consolidated = hydrateRecentRuns(current, [original, child, newest, separate]);
  assert.equal(removeRecentWorkshop(consolidated, newest, secondId, [child]).clearCurrentRun, true, 'An open older member resolves the legacy pointer even after its card was consolidated.');
  assert.equal(removeRecentWorkshop(consolidated, newest, fourthId, [child]).clearCurrentRun, false);
  assert.equal(removeRecentWorkshop(consolidated, newest, firstId).clearCurrentRun, true);
  assert.equal(JSON.stringify({ original, child, newest, separate, current }), before);
});
