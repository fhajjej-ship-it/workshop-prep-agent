import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClarificationForm, clarificationDraftForRun, type ClarificationDraft } from '../app/components/ClarificationPrompt';
import GeneratedProse, { formatGeneratedProse } from '../app/components/GeneratedProse';
import SessionTimeline from '../app/components/SessionTimeline';
import { RevisionSummary, revisionPendingState, sourceForRevision, StoppedRevisionDraft } from '../app/components/WorkshopRevision';
import type { PublicRun } from '../lib/types';

function savedRun(overrides: Partial<PublicRun> = {}): PublicRun {
  return {
    id: 'saved-workshop', createdAt: '2026-09-04T10:00:00Z', updatedAt: '2026-09-04T10:00:00Z',
    status: 'awaiting_input', mode: 'test', model: null,
    brief: { audience: 'Workshop facilitators', objective: 'Create one usable experiment card.', durationMinutes: 30, constraints: 'Fictional inputs only.', format: 'remote' },
    clarification: { key: 'detail', question: 'Which decision should participants make together?' },
    steps: 1, revision: 0, events: [], readSourceIds: [], version: 1,
    ...overrides,
  };
}

function form(run: PublicRun, draft: ClarificationDraft, busy: boolean) {
  return renderToStaticMarkup(createElement(ClarificationForm, { run, draft, busy, onContinue: () => {}, onChange: () => {} }));
}

test('a clarification answer remains visible during submission and reusable after request failure', () => {
  for (const parentRunId of [undefined, 'preserved-original']) {
    const waiting = savedRun({ parentRunId });
    const draft = { ...clarificationDraftForRun(null, waiting), value: { answer: 'Select a review owner and define the next experiment.' } };
    const running = { ...waiting, status: 'running' as const, clarification: undefined };
    const inFlight = clarificationDraftForRun(draft, running);
    assert.equal(inFlight, draft, 'A running snapshot must not replace the question or typed answer.');
    const sending = form(running, inFlight, true);
    assert.match(sending, /Select a review owner and define the next experiment\./);
    assert.match(sending, /Which decision should participants make together\?/);
    assert.match(sending, /<textarea[^>]*disabled=""/);
    const afterFailure = clarificationDraftForRun(inFlight, waiting);
    assert.equal(afterFailure, draft, 'An unsuccessful request returning to the same question keeps the input.');
    const retry = form(waiting, afterFailure, false);
    assert.match(retry, /Select a review owner and define the next experiment\./);
    assert.doesNotMatch(retry, /disabled=""/);
    assert.match(retry, /Continue preparation/);
  }
});

test('a chosen format survives submission and a failed request without another selection', () => {
  const waiting = savedRun({ clarification: { key: 'format', question: 'How will this workshop be delivered?' } });
  const draft: ClarificationDraft = { ...clarificationDraftForRun(null, waiting), value: { format: 'hybrid' } };
  const inFlight = clarificationDraftForRun(draft, { ...waiting, status: 'running', clarification: undefined });
  const retry = form(waiting, clarificationDraftForRun(inFlight, waiting), false);
  assert.match(retry, /aria-pressed="true"[^>]*>Hybrid/);
  assert.doesNotMatch(retry, /disabled=""/);
});

test('a different question or run starts with empty input instead of reusing an old answer', () => {
  const waiting = savedRun();
  const draft = { ...clarificationDraftForRun(null, waiting), value: { answer: 'A previous answer.' } };
  assert.deepEqual(clarificationDraftForRun(draft, { ...waiting, id: 'new-revision' }).value, {});
  assert.deepEqual(clarificationDraftForRun(draft, { ...waiting, clarification: { key: 'detail', question: 'What artifact should participants leave with?' } }).value, {});
  assert.equal(form({ ...waiting, status: 'failed' }, draft, false), '', 'The preserved input must not offer an advance for a terminal run.');
});

test('ready and paused revisions keep the new-preparation lock until completion or failure', () => {
  assert.equal(revisionPendingState(null, false), null);
  assert.equal(revisionPendingState(null, true), 'working');
  for (const status of ['ready', 'awaiting_input', 'running'] as const) {
    assert.ok(revisionPendingState(savedRun({ status }), false), `${status} revision remains accessible instead of being replaced.`);
  }
  assert.equal(revisionPendingState(savedRun({ status: 'awaiting_input' }), false), 'awaiting_input');
  assert.equal(revisionPendingState(savedRun({ status: 'ready' }), false), 'ready');
  assert.equal(revisionPendingState(savedRun({ status: 'completed' }), false), null);
  assert.equal(revisionPendingState(savedRun({ status: 'failed' }), false), null);
});

test('the failed draft used for feedback is inspectable with structural issues and all deliverable sections', () => {
  const material = { id: 'client-source', title: 'Saved client source', content: 'A fictional reference retained for this draft.' };
  const child = savedRun({ id: 'stopped-child', parentRunId: 'preserved-original', status: 'failed', materials: [material],
    validation: { valid: false, totalMinutes: 40, issues: ['The agenda exceeds the requested duration.', 'The exercise does not fit its agenda section.'] },
    pack: {
      title: 'Stopped experiment workshop', outcome: 'The stopped child outcome.',
      agenda: [{ title: 'Practice decision', minutes: 40, activity: 'Discuss the supplied scenario in pairs.', sourceIds: [material.id] }],
      exercise: { title: 'Choose a review owner', scenario: 'A fictional team needs a review decision.', expectedOutput: 'One completed experiment card.', sampleResponse: 'Morgan owns the review on Friday.', durationMinutes: 20, agendaSectionIndex: 0, instructions: ['Choose the owner together.'], debrief: ['What evidence would change your decision?'], sourceIds: [material.id] },
      facilitatorNotes: ['Keep the discussion focused on the decision.'], sources: [{ id: material.id, title: material.title }],
      sourceClaims: [{ claim: 'The reference supports a review decision.', quote: material.content, sourceId: material.id }],
    },
  });
  const original = savedRun({ id: 'preserved-original', status: 'completed' });
  assert.equal(sourceForRevision(original, child), child);
  const html = renderToStaticMarkup(createElement(StoppedRevisionDraft, { run: child, materials: child.materials!, onRead: () => {} }));
  for (const value of ['Stopped draft · Provisional', 'has not completed preparation', 'The agenda exceeds the requested duration.', 'The exercise does not fit its agenda section.', 'Stopped experiment workshop', 'The stopped child outcome.', 'Practice decision', 'A fictional team needs a review decision.', 'One completed experiment card.', 'Morgan owns the review on Friday.', 'Choose the owner together.', 'What evidence would change your decision?', 'Keep the discussion focused on the decision.', material.title, material.content]) assert.ok(html.includes(value), value);
  assert.match(html, /<details[^>]*open=""/);
  assert.doesNotMatch(html, /\/download|ready for your review/i);
  assert.equal(original.status, 'completed', 'Inspecting the child leaves the original unchanged.');
});

test('a failed revision without a draft keeps the original as feedback source and has no empty preview', () => {
  const original = savedRun({ id: 'original', status: 'completed' });
  const child = savedRun({ id: 'failed-child', status: 'failed' });
  assert.equal(sourceForRevision(original, child), original);
  assert.equal(renderToStaticMarkup(createElement(StoppedRevisionDraft, { run: child, materials: [], onRead: () => {} })), '');
});

test('previous versions remain reachable for no-pack and completed revisions and respect navigation locks', () => {
  const onOpenPrevious = () => {};
  const failed = savedRun({ status: 'failed', parentRunId: 'preserved-original', feedback: 'Keep the agreed agenda.' });
  const complete = { ...failed, status: 'completed' as const, pack: { title: 'Revised workshop', outcome: 'Agreed outcome', agenda: [], exercise: { title: 'Practice', instructions: [], debrief: [], sourceIds: [] }, facilitatorNotes: [], sources: [] } };
  for (const run of [failed, complete]) {
    const html = renderToStaticMarkup(createElement(RevisionSummary, { run, original: null, onOpenPrevious }));
    assert.match(html, /<button[^>]*>Open previous version<\/button>/);
    assert.doesNotMatch(html, /disabled=""/);
    const locked = renderToStaticMarkup(createElement(RevisionSummary, { run, original: null, onOpenPrevious, navigationDisabled: true }));
    assert.match(locked, /<button[^>]*disabled=""[^>]*>Open previous version<\/button>/);
  }
  const pending = renderToStaticMarkup(createElement(RevisionSummary, { run: failed, original: null, onOpenPrevious, openingPrevious: true }));
  assert.match(pending, /<button[^>]*disabled=""[^>]*>Opening previous version…<\/button>/);
  assert.match(pending, /Revision stopped/);
  assert.match(pending, /stopped before a draft was saved/);
  assert.doesNotMatch(pending, /Review the updated content/);
  const preserved = renderToStaticMarkup(createElement(RevisionSummary, { run: failed, original: { ...complete, id: failed.parentRunId! }, onOpenPrevious }));
  assert.match(preserved, /Read the previous version/);
  assert.match(preserved, /Download previous version PDF/);
  assert.doesNotMatch(preserved, /preserved original/);
  assert.equal(renderToStaticMarkup(createElement(RevisionSummary, { run: savedRun(), original: null, onOpenPrevious })), '');
});

test('generated prose renders structural escaped line breaks without corrupting literal paths', () => {
  const escaped = 'Evaluation card\\n\\n1. Architecture: High fit\\n- Evidence: grounded source use.';
  const formatted = formatGeneratedProse(escaped);
  assert.equal(formatted, 'Evaluation card\n\n1. Architecture: High fit\n- Evidence: grounded source use.');
  const html = renderToStaticMarkup(createElement(GeneratedProse, { text: escaped }));
  assert.doesNotMatch(html, /\\\\n/);
  assert.match(html, /class="generated-prose"/);
  assert.equal(formatGeneratedProse(String.raw`Keep C:\new\notes.txt as written.`), String.raw`Keep C:\new\notes.txt as written.`);
});

test('the session timeline exposes every activity and delegates its desktop minimum width to responsive CSS', () => {
  const agenda = [
    { title: 'Frame\\n\\n1. Start', minutes: 5, activity: 'Frame the decision.', sourceIds: ['source'] },
    { title: 'Explore', minutes: 10, activity: 'Explore the evidence.', sourceIds: ['source'] },
    { title: 'Decide', minutes: 10, activity: 'Make the decision.', sourceIds: ['source'] },
    { title: 'Commit', minutes: 5, activity: 'Name the next action.', sourceIds: ['source'] },
  ];
  const html = renderToStaticMarkup(createElement(SessionTimeline, { agenda }));
  assert.match(html, /aria-label="Frame 1\. Start, 5 minutes/);
  assert.ok(!html.includes('Frame\\n'), 'The visible and accessible timeline labels should not expose model escape markers.');
  for (const title of agenda.slice(1).map(item => item.title)) assert.match(html, new RegExp(`aria-label="${title},`));
  assert.match(html, /--timeline-min-width:432px/);
  assert.doesNotMatch(html, /style="min-width:432px"/);
});
