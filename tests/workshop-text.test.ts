import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorkshopText from '../app/components/WorkshopText';
import { isBlankWorksheetTable, parseWorkshopText, normalizeWorkshopText, presentParticipantWorksheet } from '../lib/workshop-text';

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

test('participant entry tables can omit a divider while prose, formulas and filled rows stay literal', () => {
  const text = 'Fill the worksheet.\n\nCard ID | Decision | Policy reason\nCard A | [Enter label] | [Enter policy reason]\nCard B | [Enter label] | [Enter policy reason]\n\nReview both decisions.';
  const parsed = parseWorkshopText(text, { participantWorksheet: true });
  assert.deepEqual(parsed, [
    { kind: 'paragraph', text: 'Fill the worksheet.' },
    { kind: 'table', headers: ['Card ID', 'Decision', 'Policy reason'], rows: [['Card A', '[Enter label]', '[Enter policy reason]'], ['Card B', '[Enter label]', '[Enter policy reason]']] },
    { kind: 'paragraph', text: 'Review both decisions.' },
  ]);
  assert.deepEqual(parseWorkshopText(text), [{ kind: 'paragraph', text }], 'Source and answer text does not infer a missing divider.');
  const html = renderToStaticMarkup(createElement(WorkshopText, { text, materials: [], participantWorksheet: true }));
  assert.equal((html.match(/<td>/g) ?? []).length, 6);
  assert.match(html, /\[Enter policy reason\]/, 'Named prompts remain intact in native cells.');
  for (const value of ['USE', '[x]', '[source-123]', '[]%', '=A1/B1', '[Enter label] | Extra cell']) {
    const ambiguous = text.replace('Card B | [Enter label]', `Card B | ${value}`);
    assert.deepEqual(parseWorkshopText(ambiguous, { participantWorksheet: true }), [{ kind: 'paragraph', text: ambiguous }]);
  }
  const fenced = `\`\`\`text\n${text}\n\`\`\``;
  assert.deepEqual(parseWorkshopText(fenced, { participantWorksheet: true }), [{ kind: 'paragraph', text: fenced }]);
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

test('participant worksheets explain the blank cells without changing the saved instructions', () => {
  const text = '| Ticket | Priority | Owner | Next action | Reason |\n| --- | --- | --- | --- | --- |\n'
    + ['Aster', 'Beacon', 'Cedar', 'Dune'].map(name => `| ${name} | [ ] | [] | [  ] | |`).join('\n');
  const before = parseWorkshopText(text);
  const html = renderToStaticMarkup(createElement(WorkshopText, { text, materials: [], participantWorksheet: true }));
  assert.match(html, /<caption[^>]*><strong>Participant worksheet<\/strong>/);
  assert.match(html, /Complete during the exercise\. Download Word to fill it in, or PDF to print it\./);
  assert.equal((html.match(/<td>/g) ?? []).length, 20);
  assert.doesNotMatch(html, /\[\s*\]/);
  for (const name of ['Aster', 'Beacon', 'Cedar', 'Dune']) assert.match(html, new RegExp(`>${name}<`));
  assert.deepEqual(parseWorkshopText(text), before, 'Rendering preserves the original saved placeholders.');
  const ordinaryTable = renderToStaticMarkup(createElement(WorkshopText, { text, materials: [] }));
  assert.doesNotMatch(ordinaryTable, /Participant worksheet/);
  assert.match(ordinaryTable, /\[ \]/, 'Only exercise instruction tables receive worksheet presentation.');
});

test('worksheet presentation preserves filled answers, named prompts and checkbox-like data', () => {
  for (const response of ['P2', '[Fill Priority]', '[x]', '[SEK 600]', '[SEK ___ plus tax]']) {
    const table = { headers: ['Ticket', 'Priority', 'Owner'], rows: [['Cedar', response, '[ ]']] };
    assert.equal(isBlankWorksheetTable(table), false);
    const text = `| Ticket | Priority | Owner |\n| --- | --- | --- |\n| Cedar | ${response} | [ ] |`;
    const html = renderToStaticMarkup(createElement(WorkshopText, { text, materials: [], participantWorksheet: true }));
    assert.doesNotMatch(html, /Participant worksheet/);
    assert.ok(html.includes(response));
    assert.match(html, /\[ \]/);
  }
  assert.equal(isBlankWorksheetTable({ headers: ['Ticket', 'Priority'], rows: [['Dune', '']] }), true);
});

test('wide mixed-blank worksheets split comparison from budget without losing fields, identities or units', () => {
  const table = {
    headers: ['Option', 'Capacity (Need >=30)', 'Step-free Entry?', 'Accessible Toilet?', 'Working Hearing Loop?', 'Charge', 'Total Cost (Charge + Common)', 'Headroom (SEK 10,000 - Total)', 'Status (Eligible / Conditional / Excluded)'],
    rows: ['North', 'East', 'South', 'West'].map(name => [name, '[ ]', '[ ]', '[ ]', '[ ]', '[SEK ___]', '[SEK ___]', '[SEK ___]', '[ ]']),
  };
  const before = structuredClone(table);
  const sections = presentParticipantWorksheet(table)!;
  assert.deepEqual(sections.map(section => section.title), ['Participant worksheet: Comparison', 'Participant worksheet: Budget and decision']);
  assert.deepEqual(sections.map(section => section.headers), [table.headers.slice(0, 5), ['Option', 'Charge (SEK)', 'Total Cost (Charge + Common) (SEK)', table.headers[7], table.headers[8]]]);
  for (const section of sections) assert.deepEqual(section.rows, table.rows.map(row => [row[0], '', '', '', '']));
  const text = [table.headers, table.headers.map(() => '---'), ...table.rows].map(row => `| ${row.join(' | ')} |`).join('\n');
  const html = renderToStaticMarkup(createElement(WorkshopText, { text, materials: [], participantWorksheet: true }));
  assert.equal((html.match(/<table /g) ?? []).length, 2);
  assert.equal((html.match(/<th scope="col">/g) ?? []).length, 10);
  assert.equal((html.match(/<td>/g) ?? []).length, 40);
  assert.doesNotMatch(html, /\[SEK|\[\s*\]/);
  assert.match(html, /Charge \(SEK\)/);
  assert.equal((html.match(/>North</g) ?? []).length, 2);
  const sourceHtml = renderToStaticMarkup(createElement(WorkshopText, { text, materials: [] }));
  assert.equal((sourceHtml.match(/<table /g) ?? []).length, 1, 'Source and answer presentation is unchanged.');
  assert.match(sourceHtml, /\[SEK ___\]/);
  const populated = structuredClone(table);
  populated.rows[0][5] = 'SEK 600';
  assert.equal(presentParticipantWorksheet(populated), null, 'One actual answer preserves the whole table.');
  assert.deepEqual(table, before);
});

test('wide generic worksheets repeat identifiers and mixed currency units stay attached to their cells', () => {
  const table = { headers: ['Reference', ...Array.from({ length: 9 }, (_, index) => `Field ${index + 1}`)], rows: [['[ ]', ...Array(9).fill('[ ]')]] };
  const sections = presentParticipantWorksheet(table)!;
  assert.deepEqual(sections.map(section => section.headers.length), [5, 5, 2]);
  assert.deepEqual(sections.flatMap(section => section.headers.slice(1)), table.headers.slice(1));
  assert.ok(sections.every(section => section.rows[0][0] === '[ ]'), 'Literal identifier labels remain unchanged.');
  const currencies = presentParticipantWorksheet({ headers: ['Option', 'Charge'], rows: [['One', '[SEK ___]'], ['Two', '[EUR ___]']] })!;
  assert.deepEqual(currencies[0].headers, ['Option', 'Charge']);
  assert.deepEqual(currencies[0].rows, [['One', 'SEK ______'], ['Two', 'EUR ______']], 'Different currencies are never collapsed into one unit.');
});
