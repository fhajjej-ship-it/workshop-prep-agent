import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkshopHome, { type WorkshopCardSummary } from '../app/components/WorkshopHome';
import WorkshopManagementDialog from '../app/components/WorkshopManagementDialog';

const noAction = () => {};
const actions = { onNewWorkshop: noAction, onOpenWorkshop: noAction, onRenameWorkshop: noAction, onDeleteWorkshop: noAction, onDuplicateWorkshop: noAction, onRemoveWorkshop: noAction };
const variants: Partial<WorkshopCardSummary>[] = [{ canManage: true }, { canManage: false }, {}, { unavailable: true, canManage: false }];
const runs = variants.map((variant, index) => ({
  id: `saved-${index}`, title: `Workshop ${index}`, updatedAt: '2026-09-05T11:00:00Z', status: 'completed' as const, revised: false, ...variant,
}));

test('every workshop card offers local removal while only manageable cards offer server actions', () => {
  for (const run of runs) {
    const html = renderToStaticMarkup(createElement(WorkshopHome, { runs: [run], loading: false, disabled: false, openingId: null, ...actions }));
    assert.match(html, new RegExp(`aria-label="Actions for ${run.title}"`));
    assert.equal((html.match(/Remove from this browser/g) ?? []).length, 1);
    if (run.canManage) {
      assert.match(html, />Rename<\/button>/);
      assert.match(html, /Delete workshop/);
      assert.doesNotMatch(html, /View only/);
    } else {
      assert.match(html, /View only/);
      assert.doesNotMatch(html, />Rename<\/button>|Delete workshop/);
    }
    assert.doesNotMatch(html, /disabled=""/);
    if (run.unavailable) assert.match(html, /aria-label="Retry opening Workshop 3"/);
  }
});

test('busy home menus preserve existing locks and the in-session brief action', () => {
  const html = renderToStaticMarkup(createElement(WorkshopHome, {
    runs, loading: false, disabled: false, openingId: runs[0].id,
    continuingBrief: true, onContinueBrief: noAction, ...actions,
  }));
  assert.equal((html.match(/aria-label="Actions for Workshop/g) ?? []).length, 4);
  assert.equal((html.match(/<summary[^>]*aria-disabled="true"/g) ?? []).length, 4);
  const removeButtons = (html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).filter(button => button.includes('Remove from this browser'));
  assert.equal(removeButtons.length, 4);
  for (const button of removeButtons) assert.match(button, /^<button\b[^>]*disabled=""/);
  assert.match(html, /Continue your brief/);
  assert.doesNotMatch(html, /Start with a brief/);
});

test('readable saved packs can be duplicated independently of source ownership', () => {
  for (const canManage of [true, false]) {
    for (const status of ['completed', 'failed'] as const) {
      const run = { ...runs[0], canManage, canDuplicate: true, status };
      const html = renderToStaticMarkup(createElement(WorkshopHome, { runs: [run], loading: false, disabled: false, openingId: null, ...actions }));
      assert.match(html, />Duplicate<\/button>/);
      assert.doesNotMatch(html, /disabled=""/);
      if (!canManage) {
        assert.match(html, /View only/);
        assert.doesNotMatch(html, />Rename<\/button>|Delete workshop/);
      }
      const busy = renderToStaticMarkup(createElement(WorkshopHome, { runs: [run], loading: false, disabled: true, openingId: null, ...actions }));
      assert.match(busy, /<button[^>]*disabled=""[^>]*>[\s\S]*?Duplicate<\/button>/);
    }
  }
  for (const variant of [{ canDuplicate: false }, { canDuplicate: undefined }, { canDuplicate: true, unavailable: true }]) {
    const html = renderToStaticMarkup(createElement(WorkshopHome, { runs: [{ ...runs[0], ...variant }], loading: false, disabled: false, openingId: null, ...actions }));
    assert.doesNotMatch(html, />Duplicate<\/button>/);
    assert.match(html, /Remove from this browser/);
  }
});

test('the duplicate dialog asks for a bounded copy name before creation', () => {
  const callbacks = { onClose: noAction, onBusyChange: noAction, onRenamed: noAction, onDeleted: noAction, onDuplicated: noAction };
  for (const title of ['Support triage', 'A'.repeat(180)]) {
    const html = renderToStaticMarkup(createElement(WorkshopManagementDialog, { action: { id: 'saved-source', title, kind: 'duplicate' }, ...callbacks }));
    assert.match(html, /Duplicate workshop/);
    assert.match(html, /Copy name/);
    assert.match(html, /Creates a separate workshop from this saved pack and its materials/);
    assert.match(html, /value="[^"]* \(copy\)"/);
    const name = /<input[^>]*value="([^"]*)"/.exec(html)?.[1];
    assert.ok(name && name.length <= 180);
    assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""[^>]*>Create copy<\/button>/, 'Creation waits for the fresh saved source and explicit submission.');
    assert.match(html, /<input[^>]*autofocus=""/);
    assert.doesNotMatch(html, /Permanently deletes|workshop-delete-button|Save name/);
  }
  const rename = renderToStaticMarkup(createElement(WorkshopManagementDialog, { action: { id: 'saved-source', title: 'Support triage', kind: 'rename' }, ...callbacks }));
  assert.match(rename, /value="Support triage"/);
  assert.match(rename, /Save name/);
  const deletion = renderToStaticMarkup(createElement(WorkshopManagementDialog, { action: { id: 'saved-source', title: 'Support triage', kind: 'delete' }, ...callbacks }));
  assert.match(deletion, /Permanently deletes/);
  assert.match(deletion, /workshop-delete-button/);
  assert.doesNotMatch(deletion, /<input/);
});
