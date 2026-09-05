import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MaterialInput from '../app/components/MaterialInput';
import { materials } from '../lib/materials';
import { revisionInputRequest, revisionInputSchema, sourceRevisionFeedback, sourceSelectionChanged } from '../lib/revision-input';

const added = { id: 'new-source', title: 'Extra facilitator guide', content: 'Use a shared worksheet with a named owner and a deadline.', kind: 'text' as const };
const emptyText = { title: '', content: '' };

test('source changes can rerun without invented feedback and reject unfinished or missing material input', () => {
  const selected = [materials[0], added];
  assert.deepEqual(revisionInputRequest({ feedback: '', materials: selected, textDraft: emptyText }, [materials[0]]), { feedback: sourceRevisionFeedback, materials: selected });
  assert.deepEqual(revisionInputRequest({ feedback: 'Keep the existing timing.', materials: selected, textDraft: emptyText }, selected), { feedback: 'Keep the existing timing.' });
  assert.equal(sourceSelectionChanged([...selected].reverse(), selected), false);
  assert.equal(sourceSelectionChanged([{ ...added, content: 'A replacement reference with a different deadline.' }], [added]), true);
  assert.throws(() => revisionInputRequest({ feedback: '', materials: selected, textDraft: emptyText }, selected), /Describe a change/);
  assert.throws(() => revisionInputRequest({ feedback: '', materials: selected, textDraft: { title: 'Unadded source', content: '' } }, []), /Add or discard/);
  assert.throws(() => revisionInputRequest({ feedback: 'Revise the exercise.', materials: [], textDraft: emptyText }, selected));
});

test('a saved source edit restores selected materials and unfinished text without changing its original snapshots', () => {
  const original = structuredClone([materials[0]]);
  const draft = { feedback: 'Make a new handout.', materials: [materials[0], added], textDraft: { title: 'Another source', content: 'Text I have not yet finished adding.' } };
  const restored = revisionInputSchema.parse(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(restored, draft);
  restored.materials[0].content = 'An edit made only to the restored input.';
  assert.deepEqual(original, [materials[0]]);
  assert.equal(revisionInputSchema.safeParse({ ...draft, materials: [added, added] }).success, false);
  assert.equal(revisionInputSchema.safeParse({ ...draft, textDraft: { title: '', content: 'x'.repeat(20001) } }).success, false);
});

test('revision material picker preserves selected examples when adding and explains the current rerun action', () => {
  const props = { examples: materials, selected: materials, textDraft: emptyText, disabled: false, onChange: () => {}, onTextDraftChange: () => {}, onRead: () => {}, onBusyChange: () => {} };
  const html = renderToStaticMarkup(createElement(MaterialInput, { ...props, replaceExamplesOnAdd: false, preparationLabel: 'Rerun workshop' }));
  assert.doesNotMatch(html, /first material replaces/);
  assert.match(html, /All 3 places are used/);
  assert.match(html, /choose Rerun workshop in live mode/);
  assert.match(renderToStaticMarkup(createElement(MaterialInput, props)), /first material replaces/);
});
