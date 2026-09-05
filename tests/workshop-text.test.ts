import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkshopText from '../app/components/WorkshopText';
import { parseWorkshopText, normalizeWorkshopText } from '../lib/workshop-text';

const material = { id: 'source-1234-5678', title: 'Help desk practice guide', content: 'Reference text.' };
const worksheet = `Complete all five fields. [${material.id}]

| Ticket | Priority | Owner | Next action | Customer reply |
| --- | --- | --- | --- | --- |
| Aster | [Fill Priority] | | | |
| Beacon | | | | |
| Cedar | | | | |

Compare your answers in pairs.`;

test('a worksheet becomes a complete table without losing the surrounding instructions', () => {
  const blocks = parseWorkshopText(worksheet);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], { kind: 'paragraph', text: `Complete all five fields. [${material.id}]` });
  assert.deepEqual(blocks[1], { kind: 'table', headers: ['Ticket', 'Priority', 'Owner', 'Next action', 'Customer reply'], rows: [
    ['Aster', '[Fill Priority]', '', '', ''], ['Beacon', '', '', '', ''], ['Cedar', '', '', '', ''],
  ] });
  assert.deepEqual(blocks[2], { kind: 'paragraph', text: 'Compare your answers in pairs.' });
  assert.deepEqual(parseWorkshopText(worksheet.replaceAll('\n', '\\n')), blocks);
});

test('escaped pipes are cell content and malformed rows remain visible', () => {
  const blocks = parseWorkshopText('Choice | Action\n:--- | ---:\nA \\| B | Use `x|y`\nToo | many | fields\nFinal instruction.');
  assert.deepEqual(blocks[0], { kind: 'table', headers: ['Choice', 'Action'], rows: [['A | B', 'Use `x|y`']] });
  assert.deepEqual(blocks[1], { kind: 'paragraph', text: 'Too | many | fields\nFinal instruction.' });
  const incomplete = '| Choice | Action |\n| --- | --- |';
  assert.deepEqual(parseWorkshopText(incomplete), [{ kind: 'paragraph', text: incomplete }]);
});

test('literal paths, fenced samples and ordinary pipes are not reinterpreted as worksheets', () => {
  const literal = 'C:\\new-folder\\notes.txt';
  assert.equal(normalizeWorkshopText(literal), literal);
  for (const text of ['Discuss A | B with your partner.', '```text\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```']) {
    assert.deepEqual(parseWorkshopText(text), [{ kind: 'paragraph', text }]);
  }
});

test('the visible worksheet uses table cells and readable source links while preserving placeholders', () => {
  const html = renderToStaticMarkup(createElement(WorkshopText, { text: worksheet, materials: [material], onRead: () => {} }));
  assert.equal((html.match(/<th scope="col">/g) ?? []).length, 5);
  assert.equal((html.match(/<td>/g) ?? []).length, 15);
  assert.match(html, /Read source: Help desk practice guide/);
  assert.match(html, />Help desk practice guide<\/button>/);
  assert.match(html, /\[Fill Priority\]/);
  assert.doesNotMatch(html, /\[source-1234-5678\]|\| ---/);
  assert.match(html, /Compare your answers in pairs\./);
  assert.match(html, /class="workshop-table-scroll"[^>]*tabindex="0"/);
});

test('history previews resolve source titles and render supplied markup as inert text', () => {
  const html = renderToStaticMarkup(createElement(WorkshopText, { text: `<script>alert('sample')</script> [${material.id}] [Fill Owner]`, materials: [material] }));
  assert.match(html, /\[Help desk practice guide\]/);
  assert.match(html, /\[Fill Owner\]/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
