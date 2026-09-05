import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkshopHistoryList } from '../app/components/WorkshopHistory';
import type { RecentRunSummary } from '../lib/recent-runs';

const statuses: RecentRunSummary['status'][] = ['ready', 'running', 'awaiting_input', 'completed', 'failed'];
const title = 'Candidate Assessment & Architecture Briefing: A complete workshop title that needs more than one line';
const runs = statuses.map((status, index) => ({ id: `run-${index}`, title, updatedAt: '2026-09-04T21:48:00.000Z', status, revised: index === 3 }));

test('workshop history distinguishes identical titles by date, status and current revision', () => {
  const html = renderToStaticMarkup(createElement(WorkshopHistoryList, {
    runs, currentRunId: 'run-3', openingId: null, disabled: false, onSelect: () => {},
  }));
  assert.equal((html.match(/Candidate Assessment &amp; Architecture Briefing/g) ?? []).length, 5);
  for (const label of ['Ready to continue', 'Preparing', 'Answer needed', 'Ready for review', 'Preparation stopped', 'Revised', 'Current']) assert.ok(html.includes(label), label);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.equal((html.match(/dateTime="2026-09-04T21:48:00.000Z"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /In progress|Approved|<select/);
});

test('opening a workshop is shown on the selected row and prevents another selection', () => {
  const html = renderToStaticMarkup(createElement(WorkshopHistoryList, {
    runs, currentRunId: 'run-3', openingId: 'run-0', disabled: true, onSelect: () => {},
  }));
  assert.equal((html.match(/Opening…/g) ?? []).length, 1);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 5);
  assert.match(html, /aria-current="page"/);
});
