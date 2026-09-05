import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { PDFParse } from 'pdf-parse';
import { createRun } from '../lib/agent';
import { scriptedContentReviewer, packHash } from '../lib/content-review';
import { packDocx } from '../lib/download-docx';
import { packPdf } from '../lib/download-pdf';
import { documentBlockContent, documentBlockText, packExportBlocks, packMarkdown } from '../lib/download';
import { getConfig } from '../lib/config';
import { materials } from '../lib/materials';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief, Run } from '../lib/types';
import { validatePack } from '../lib/validation';
import { GET as downloadRoute } from '../app/api/runs/[id]/download/route';

const workspaceDirectory = process.cwd();
const fixtureDirectory = path.join(workspaceDirectory, '.local', 'export-fixtures');
const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const brief: Brief = { audience: 'International facilitators', objective: 'Prepare an editable workshop pack with an exercise and review notes.', durationMinutes: 90, constraints: 'Use fictional information and retain multilingual Latin text.', format: 'remote' };
const multilingual = 'Ångström, smörgåsbord, déjà vu, façade, Łódź, Türkiye, São Tomé, Dvořák and Romanian Țară remain readable; R&D <planning> stays editable.';
const fixtureMaterials = materials.map((material, index) => ({ ...material, id: `1000000${index}-1111-4111-8111-11111111111${index}` }));

async function completedRun(store: LocalRunStore, legacy = false): Promise<Run> {
  const run = await createRun(brief, store, config, fixtureMaterials);
  run.pack = createTestPack(brief, { materials: fixtureMaterials });
  run.pack.exercise.sampleResponse += '\\nFirst escaped section.\\r\\nSecond escaped section.\\rThird escaped section.';
  run.pack.facilitatorNotes.push(`${multilingual} ${'A long editable facilitation note wraps naturally across pages without clipping. '.repeat(28)}END OF LONG NOTE. [${fixtureMaterials[0].id}]`);
  if (legacy) {
    delete run.workflowVersion;
    delete run.pack.exercise.scenario;
    delete run.pack.exercise.expectedOutput;
    delete run.pack.exercise.sampleResponse;
    delete run.pack.exercise.durationMinutes;
    delete run.pack.exercise.agendaSectionIndex;
    delete run.pack.sourceClaims;
  }
  run.readSourceIds = fixtureMaterials.map(source => source.id);
  run.revision = 1;
  run.validation = validatePack(run.pack, brief, run.readSourceIds, fixtureMaterials, { requireDeliverableFields: !legacy });
  assert.equal(run.validation.valid, true, run.validation.issues.join(' '));
  if (!legacy) run.contentReview = { status: 'passed', reviewedRevision: 1, reviewedPackHash: packHash(run.pack), mode: 'scripted', attempt: 1, issues: [], checks: (await scriptedContentReviewer({ brief, materials: fixtureMaterials, pack: run.pack })).checks };
  run.status = 'completed';
  await store.save(run);
  return run;
}

function xmlText(xml: string): string {
  return xml.replace(/<w:tab\/?[^>]*>/g, '\t').replace(/<w:br\/?[^>]*>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

const normalized = (text: string) => text.replace(/-\s+/g, '-').replace(/\s+/g, ' ').trim();

test('PDF and Word generators create openable, complete, Unicode documents and reusable fixture files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-export-'));
  try {
    const run = await completedRun(new LocalRunStore(directory));
    const exportBlocks = packExportBlocks(run);
    assert.match(exportBlocks[1].text, /Deterministic test output\. No live model was used\. Human review required\./);
    const liveRun: Run = { ...run, mode: 'live', model: 'gemini-3.8-flash', materials: fixtureMaterials.map(material => ({ ...material, kind: 'text' })) };
    assert.equal(packExportBlocks(liveRun)[1].text, 'Prepared from supplied materials. Review before use.');
    assert.match(packMarkdown(liveRun), /Live model: gemini-3\.8-flash\. Human review required\./, 'Markdown retains detailed model provenance.');
    const timeline = exportBlocks.find(block => block.kind === 'timeline');
    assert.ok(timeline?.timeline, 'Binary exports include a structured session timeline.');
    assert.equal(timeline.timeline.totalMinutes, brief.durationMinutes);
    assert.deepEqual(timeline.timeline.segments.map(segment => segment.minutes), run.pack!.agenda.map(item => item.minutes));
    assert.match(timeline.text, /Section 1: \d+ minutes, 0–\d+ elapsed/);
    for (const item of run.pack!.agenda) {
      const headingIndex = exportBlocks.findIndex(block => block.kind === 'subheading' && block.text.endsWith(`· ${item.title}`));
      assert.ok(headingIndex >= 0, `Agenda export block exists for ${item.title}.`);
      assert.equal(exportBlocks[headingIndex].keepWithNext, true);
      assert.equal(exportBlocks[headingIndex + 1].kind, 'paragraph');
      assert.equal(exportBlocks[headingIndex + 1].keepWithNext, true);
      assert.equal(exportBlocks[headingIndex + 2].kind, 'source');
    }
    for (const [index] of run.pack!.sourceClaims!.entries()) {
      const headingIndex = exportBlocks.findIndex(block => block.kind === 'subheading' && block.text === `Claim ${index + 1}`);
      assert.equal(exportBlocks.slice(headingIndex, headingIndex + 3).every(block => block.keepWithNext), true, `Claim ${index + 1} keeps its evidence chain together.`);
      assert.equal(exportBlocks[headingIndex + 3].kind, 'quote');
    }
    const [pdf, docx] = await Promise.all([packPdf(run), packDocx(run)]);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.match(pdf.subarray(-32).toString(), /%%EOF/);
    assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length < 10, 'Footer rendering must not add blank pages.');
    assert.equal(docx.subarray(0, 2).toString(), 'PK');
    const zip = await JSZip.loadAsync(docx, { checkCRC32: true });
    assert.ok(zip.file('[Content_Types].xml'));
    assert.ok(zip.file('word/document.xml'));
    const wordText = xmlText(await zip.file('word/document.xml')!.async('string'));
    const documentXml = await zip.file('word/document.xml')!.async('string');
    const parser = new PDFParse({ data: pdf, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
    let pdfText = '';
    try {
      const result = await parser.getText();
      assert.ok((result.pages?.length ?? 0) < 10, 'Footer rendering must not add blank pages.');
      pdfText = result.text.replace(/Workshop Prep Agent · Human review required · \d+ \/ \d+/g, '').replace(/-- \d+ of \d+ --/g, '');
    } finally { await parser.destroy(); }
    for (const text of [run.pack!.title, run.brief.objective, 'Session timeline', timeline.text, 'Scenario and input', run.pack!.exercise.scenario!, 'Source-supported claims', run.pack!.sourceClaims![0].quote, 'Automated checks', 'Content review', multilingual]) {
      assert.ok(normalized(pdfText).includes(normalized(text)), `PDF should contain: ${text.slice(0, 60)}`);
      assert.ok(normalized(wordText).includes(normalized(text)), `Word should contain: ${text.slice(0, 60)}`);
    }
    assert.ok(pdfText.includes('long editable facilitation note'));
    assert.ok(pdfText.includes('END OF LONG NOTE.'), 'Long PDF text reaches its final sentence.');
    assert.ok(wordText.includes('long editable facilitation note'));
    assert.ok(wordText.includes('END OF LONG NOTE.'), 'Long Word text reaches its final sentence.');
    assert.equal(documentBlockText({ kind: 'paragraph', text: 'First\\nSecond\\r\\nThird\\rFourth' }), 'First\nSecond\nThird\nFourth');
    assert.ok(!pdfText.includes('\\nFirst escaped section'), 'PDF must not display a literal backslash-n marker.');
    assert.ok(!wordText.includes('\\nFirst escaped section'), 'Word must not display a literal backslash-n marker.');
    assert.match(pdfText, /First escaped section\.\s+Second escaped section\.\s+Third escaped section\./);
    assert.match(wordText, /First escaped section\.\s+Second escaped section\.\s+Third escaped section\./);
    const documentText = exportBlocks.map(documentBlockText).join('\n');
    const uuidPattern = /(?:source-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
    assert.doesNotMatch(documentText, uuidPattern, 'Binary document blocks must not expose UUID-style identifiers.');
    assert.doesNotMatch(pdfText, uuidPattern, 'PDF must not expose UUID-style identifiers.');
    assert.doesNotMatch(wordText, uuidPattern, 'Word must not expose UUID-style identifiers.');
    for (const identifier of [run.id, ...run.pack!.sources.map(source => source.id)]) {
      assert.ok(!documentText.includes(identifier), `Binary blocks expose internal identifier ${identifier}.`);
      assert.ok(!pdfText.includes(identifier), `PDF exposes internal identifier ${identifier}.`);
      assert.ok(!wordText.includes(identifier), `Word exposes internal identifier ${identifier}.`);
    }
    for (const source of run.pack!.sources) {
      assert.ok(pdfText.includes(source.title), `PDF should name source ${source.title}.`);
      assert.ok(wordText.includes(source.title), `Word should name source ${source.title}.`);
    }
    for (const block of exportBlocks.filter(block => block.text.length <= 1000)) {
      const renderedText = documentBlockText(block);
      assert.ok(normalized(pdfText).includes(normalized(renderedText)), `PDF omits a ${block.kind} block: ${block.text.slice(0, 60)}`);
      assert.ok(normalized(wordText).includes(normalized(documentBlockContent(block))), `Word omits a ${block.kind} block: ${block.text.slice(0, 60)}`);
    }
    assert.match(documentXml, /<w:pStyle w:val="Title"\/>[\s\S]*?<w:color w:val="000000"\/>/, 'Word title uses actual black text.');
    assert.match(documentXml, /<w:numPr>/, 'Word lists use editable native numbering.');
    assert.match(documentXml, /<w:tbl>/, 'Word timeline uses an editable table.');
    assert.match(documentXml, /<w:shd[^>]*w:fill="193A50"/, 'Word timeline retains the first app segment color.');
    const markdown = packMarkdown(run);
    assert.ok(markdown.includes(run.id), 'Markdown retains the saved run ID.');
    assert.ok(markdown.includes(run.pack!.sources[0].id), 'Markdown retains the saved source ID.');
    assert.ok(markdown.includes('\\nFirst escaped section.\\r\\nSecond escaped section.\\rThird escaped section.'), 'Markdown preserves the saved literal markers.');
    assert.ok(!markdown.includes('Session timeline.'), 'The binary timeline does not change Markdown output.');
    assert.ok(JSON.stringify(run.pack).includes('\\\\nFirst escaped section'), 'JSON preserves the saved literal marker.');
    assert.match(markdown, /### Instructions\n\n1\. .+\n2\. /s, 'Markdown retains consecutive numbered-list lines.');
    assert.match(markdown, /### Debrief\n\n- .+\n- /s, 'Markdown retains consecutive bullet-list lines.');
    await mkdir(fixtureDirectory, { recursive: true });
    await Promise.all([writeFile(path.join(fixtureDirectory, 'synthetic-workshop.pdf'), pdf), writeFile(path.join(fixtureDirectory, 'synthetic-workshop.docx'), docx)]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('download route keeps completion/review gates, MIME types and format errors', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-route-export-'));
  const previousDirectory = process.cwd();
  const previousEnvironment = process.env;
  try {
    process.chdir(directory);
    process.env = { NODE_ENV: 'test', WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' };
    const store = new LocalRunStore();
    const incomplete = await createRun(brief, store, config);
    const call = (run: Run, format: string) => downloadRoute(new Request(`http://localhost/api/runs/${run.id}/download?format=${format}`), { params: Promise.resolve({ id: run.id }) });
    assert.equal((await call(incomplete, 'pdf')).status, 409);
    const run = await completedRun(store);
    assert.equal((await call(run, 'pages')).status, 400);
    const pdf = await call(run, 'pdf');
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.match(pdf.headers.get('content-disposition')!, /\.pdf"$/);
    const docx = await call(run, 'docx');
    assert.equal(docx.status, 200);
    assert.equal(docx.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.match(docx.headers.get('content-disposition')!, /\.docx"$/);
    const reviewedPackHash = run.contentReview!.reviewedPackHash;
    delete run.contentReview!.reviewedPackHash;
    await store.save(run);
    const legacyReviewBefore = JSON.stringify(await store.read(run.id));
    for (const format of ['pdf', 'docx', 'md', 'json']) assert.equal((await call(run, format)).status, 200, `Older completed review should export as ${format}.`);
    assert.equal(JSON.stringify(await store.read(run.id)), legacyReviewBefore, 'Compatibility downloads must not rewrite the saved pack.');
    run.contentReview!.reviewedPackHash = '0'.repeat(64);
    await store.save(run);
    assert.equal((await call(run, 'pdf')).status, 409, 'A present mismatched fingerprint must fail closed.');
    run.contentReview!.reviewedPackHash = reviewedPackHash;
    run.contentReview = undefined;
    await store.save(run);
    assert.equal((await call(run, 'docx')).status, 409);
  } finally {
    process.chdir(previousDirectory); process.env = previousEnvironment;
    await rm(directory, { recursive: true, force: true });
  }
});

test('worksheet tables retain editable cells, numbered instructions, and complete PDF rows across pages', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-table-export-'));
  try {
    const run = await completedRun(new LocalRunStore(directory));
    const headers = ['Ticket', 'Priority', 'Owner', 'Next action', 'Reason'];
    const rows = Array.from({ length: 13 }, (_, index) => [
      `Case ${String(index + 1).padStart(2, '0')}`, index % 2 ? 'P2' : 'P1', `Coordinator ${index + 1}`,
      `Record affected users, check the workaround, and request a restoration update for case ${index + 1}.`,
      index === 4
        ? `${Array.from({ length: 12 }, (_, sentence) => `Evidence ${String(sentence + 1).padStart(2, '0')}: The formatted export fails for the reported ticket although CSV export works.`).join(' ')} END OF EXTENDED CELL.`
        : `Case ${index + 1} follows the policy in [${fixtureMaterials[0].id}].`,
    ]);
    const worksheet = ['Complete each field before the debrief.', '', `| ${headers.join(' | ')} |`, '| :--- | --- | --- | --- | --- |', ...rows.map(row => `| ${row.join(' | ')} |`), '', 'After the worksheet, compare every entry with the worked answer.'].join('\n');
    run.pack!.exercise.instructions = ['Read the ticket facts.', worksheet, 'Agree on one final answer.'];
    const before = JSON.stringify(run);
    const markdownBefore = packMarkdown(run);
    const blocks = packExportBlocks(run);
    assert.deepEqual(blocks.filter(block => block.kind === 'number').map(block => [block.number, block.text]), [
      [1, 'Read the ticket facts.'], [2, 'Complete each field before the debrief.'], [3, 'Agree on one final answer.'],
    ], 'One native number is retained for each original instruction.');
    const tableBlock = blocks.find(block => block.kind === 'table');
    assert.ok(tableBlock?.table);
    assert.deepEqual(tableBlock.table.headers, headers);
    assert.equal(tableBlock.table.rows.length, rows.length);
    assert.ok(tableBlock.table.rows[0][4].includes(fixtureMaterials[0].title), 'Cell citations become readable source titles.');
    assert.ok(blocks.some(block => block.kind === 'paragraph' && block.listContinuation && block.text.startsWith('After the worksheet')));
    const [pdf, docx] = await Promise.all([packPdf(run), packDocx(run)]);
    const zip = await JSZip.loadAsync(docx, { checkCRC32: true });
    const documentXml = await zip.file('word/document.xml')!.async('string');
    const worksheetXml = [...documentXml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].find(match => xmlText(match[0]).startsWith('Ticket'))?.[0];
    assert.ok(worksheetXml, 'The worksheet is a native Word table.');
    assert.match(worksheetXml, /<w:tblHeader\/>/, 'The Word header repeats when the table spans pages.');
    const wordRows = [...worksheetXml.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map(match => [...match[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(cell => xmlText(cell[0]).trim()));
    assert.deepEqual(wordRows, [tableBlock.table.headers, ...tableBlock.table.rows], 'Every worksheet cell stays editable and complete.');
    const instructionsXml = documentXml.split('>Instructions</w:t>')[1].split('>Sample response</w:t>')[0];
    assert.equal((instructionsXml.match(/<w:numPr>/g) ?? []).length, 3, 'Continuation prose and table cells do not advance the instruction list.');
    const parser = new PDFParse({ data: pdf, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
    try {
      const result = await parser.getText();
      const worksheetPages = result.pages.filter(page => /Case \d{2}|Evidence \d{2}/.test(page.text));
      assert.ok(worksheetPages.length >= 3, 'The long-cell fixture exercises multiple table page breaks.');
      assert.ok(worksheetPages.length < 10, 'Table pagination remains bounded.');
      for (const page of worksheetPages) {
        for (const header of headers) assert.ok(page.text.includes(header), `Each table page repeats ${header}.`);
      }
      assert.doesNotMatch(result.text, /\|\s*:?-{3,}|\| Ticket \|/, 'PDF omits Markdown table syntax.');
      assert.doesNotMatch(xmlText(documentXml), /\|\s*:?-{3,}|\| Ticket \|/, 'Word omits Markdown table syntax.');
      // PDF extraction can interleave adjacent columns; unique phrases prove each cell survives.
      for (let index = 0; index < rows.length; index++) {
        assert.ok(result.text.includes(rows[index][0]), `PDF keeps ticket ${index + 1}.`);
        assert.ok(result.text.includes(rows[index][2]), `PDF keeps owner ${index + 1}.`);
        assert.ok(normalized(result.text).includes(`restoration update for case ${index + 1}.`), `PDF keeps the final action for case ${index + 1}.`);
      }
      for (let sentence = 1; sentence <= 12; sentence++) assert.ok(result.text.includes(`Evidence ${String(sentence).padStart(2, '0')}`), `PDF preserves long-cell sentence ${sentence}.`);
      for (const text of ['END OF EXTENDED CELL.', '2. Complete each field', 'After the worksheet, compare every entry', '3. Agree on one final answer.', 'Source-supported claims', 'Quality and review']) {
        assert.ok(normalized(result.text).includes(text), `PDF keeps ${text}.`);
      }
    } finally { await parser.destroy(); }
    assert.equal(JSON.stringify(run), before, 'Rendering never mutates the saved run.');
    assert.equal(packMarkdown(run), markdownBefore, 'Markdown output retains original table syntax and provenance.');
    assert.ok(markdownBefore.includes(worksheet));
    await mkdir(fixtureDirectory, { recursive: true });
    await Promise.all([writeFile(path.join(fixtureDirectory, 'worksheet-pagination.pdf'), pdf), writeFile(path.join(fixtureDirectory, 'worksheet-pagination.docx'), docx)]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('historical packs export without changing their saved content', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-historical-export-'));
  const previousDirectory = process.cwd();
  const previousEnvironment = process.env;
  try {
    process.chdir(directory);
    process.env = { NODE_ENV: 'test', WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' };
    const store = new LocalRunStore();
    const run = await completedRun(store, true);
    const before = JSON.stringify(await store.read(run.id));
    for (const format of ['pdf', 'docx', 'md', 'json']) {
      const response = await downloadRoute(new Request(`http://localhost/api/runs/${run.id}/download?format=${format}`), { params: Promise.resolve({ id: run.id }) });
      assert.equal(response.status, 200);
      assert.ok((await response.arrayBuffer()).byteLength > 100);
    }
    assert.equal(JSON.stringify(await store.read(run.id)), before);
  } finally {
    process.chdir(previousDirectory); process.env = previousEnvironment;
    await rm(directory, { recursive: true, force: true });
  }
});

test('PDF preserves an oversized header without trapping body rows in page creation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-header-export-'));
  try {
    const run = await completedRun(new LocalRunStore(directory));
    const longHeader = `${Array.from({ length: 65 }, (_, index) => `Header detail ${String(index + 1).padStart(2, '0')}.`).join(' ')} END OF HEADER.`;
    run.pack!.exercise.instructions = [`| Ticket | Priority | Owner | Next action | ${longHeader} |\n| --- | --- | --- | --- | --- |\n| Aster | P1 | Incident lead | Restore service | Complete body after oversized header. |`];
    const parser = new PDFParse({ data: await packPdf(run), isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
    try {
      const result = await parser.getText();
      assert.ok(result.total < 15, 'Oversized header pagination remains bounded.');
      for (let index = 1; index <= 65; index++) assert.ok(normalized(result.text).includes(`Header detail ${String(index).padStart(2, '0')}.`));
      assert.ok(normalized(result.text).includes('END OF HEADER.'));
      assert.ok(normalized(result.text).includes('Complete body after oversized header.'));
      assert.ok(result.text.includes('Quality and review'));
    } finally { await parser.destroy(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('participant worksheets remove empty placeholders and stray numbering while PDF headings stay with content', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-participant-export-'));
  try {
    const run = await completedRun(new LocalRunStore(directory));
    const tickets = ['Aster', 'Beacon', 'Cedar', 'Dune'];
    const worksheet = ['| Ticket | Priority | Owner | Next action | Reason |', '| --- | --- | --- | --- | --- |', ...tickets.map(ticket => `| ${ticket} | [ ] | [] | [  ] | [ ] |`)].join('\n');
    run.pack!.exercise.instructions = ['Read all four ticket facts.', 'Review the supplied policy.', 'Complete the response template.', worksheet, 'Compare the completed responses.'];
    run.pack!.exercise.sampleResponse = `Illustrative worked answers for all four tickets:\n\n${tickets.map((ticket, index) => `${index + 1}. Ticket: ${ticket}\n- Priority: P${index % 3 + 1}\n- Owner: Accountable coordinator\n- Next action: Record the affected users, confirm the documented workaround, and request the next investigation update.\n- Reason: This fictional example retains the complete decision and the source-supported next action so facilitators can compare every field against the worksheet without reconstructing the answer.`).join('\n\n')}`;
    const before = JSON.stringify(run);
    const markdownBefore = packMarkdown(run);
    const blocks = packExportBlocks(run);
    assert.deepEqual(blocks.filter(block => block.kind === 'number').map(block => [block.number, block.text]), [
      [1, 'Read all four ticket facts.'], [2, 'Review the supplied policy.'], [3, 'Complete the response template.'], [4, 'Compare the completed responses.'],
    ], 'A table-only instruction produces no empty number or gap.');
    const table = blocks.find(block => block.kind === 'table')!.table!;
    assert.deepEqual(table.rows, tickets.map(ticket => [ticket, '', '', '', '']));
    assert.ok(blocks.some(block => block.text === 'Participant worksheet'));
    assert.ok(blocks.some(block => block.text === 'Complete during the exercise.'));
    const literalLabel = structuredClone(run);
    literalLabel.pack!.exercise.instructions = [worksheet.replace('| Aster |', '| [ ] |')];
    assert.equal(packExportBlocks(literalLabel).find(block => block.kind === 'table')!.table!.rows[0][0], '[ ]', 'First-column row labels are preserved exactly.');
    for (const namedOrFilled of ['[Fill Priority]', 'P2']) {
      const preserved = structuredClone(run);
      preserved.pack!.exercise.instructions = [worksheet.replace('| [ ] |', `| ${namedOrFilled} |`)];
      const preservedBlocks = packExportBlocks(preserved);
      assert.equal(preservedBlocks.some(block => block.text === 'Participant worksheet'), false);
      assert.deepEqual(preservedBlocks.find(block => block.kind === 'table')!.table!.rows[0], ['Aster', namedOrFilled, '[]', '[  ]', '[ ]'], 'Named placeholders and partially completed rows remain untouched.');
    }
    const answerTable = structuredClone(run);
    answerTable.pack!.exercise.instructions = ['Complete the response template.'];
    answerTable.pack!.exercise.sampleResponse = worksheet;
    const answerBlocks = packExportBlocks(answerTable);
    assert.equal(answerBlocks.some(block => block.text === 'Participant worksheet'), false, 'Answer tables are not relabeled as participant worksheets.');
    assert.equal(answerBlocks.find(block => block.kind === 'table')!.table!.rows[0][1], '[ ]');
    const [pdf, docx] = await Promise.all([packPdf(run), packDocx(run)]);
    const zip = await JSZip.loadAsync(docx, { checkCRC32: true });
    const documentXml = await zip.file('word/document.xml')!.async('string');
    const instructionsXml = documentXml.split('>Instructions</w:t>')[1].split('>Sample response</w:t>')[0];
    assert.equal((instructionsXml.match(/<w:numPr>/g) ?? []).length, 4);
    assert.ok(xmlText(instructionsXml).includes('Participant worksheet'));
    const worksheetXml = [...instructionsXml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)][0][0];
    const wordRows = [...worksheetXml.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map(match => [...match[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(cell => xmlText(cell[0]).trim()));
    assert.deepEqual(wordRows, [table.headers, ...table.rows], 'Word contains real blank editable cells.');
    const parser = new PDFParse({ data: pdf, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
    try {
      const result = await parser.getText();
      const pages = result.pages.map(page => page.text.replace(/Workshop Prep Agent · Human review required · \d+ \/ \d+/g, '').trim());
      assert.ok(pages.some(page => page.includes('Participant worksheet') && page.includes('Sample response')), 'Worked answers start in the available space below the worksheet.');
      for (const block of blocks.filter(block => ['heading', 'subheading'].includes(block.kind))) {
        const page = pages.find(text => text.includes(block.text));
        assert.ok(page, `PDF retains heading ${block.text}.`);
        assert.ok(page.slice(page.indexOf(block.text) + block.text.length).trim().length > 0, `Heading ${block.text} has following content on the same page.`);
      }
      const allText = pages.join('\n');
      assert.ok(normalized(allText).includes(normalized(run.pack!.exercise.sampleResponse!)), 'All worked answers remain complete after page reflow.');
      assert.doesNotMatch(allText, /\[\s*\]/);
      assert.doesNotMatch(allText, /^\s*\d+\.\s*$/m, 'PDF has no bare instruction number.');
      assert.ok(allText.includes('4. Compare the completed responses.'));
    } finally { await parser.destroy(); }
    assert.equal(JSON.stringify(run), before);
    assert.equal(packMarkdown(run), markdownBefore);
    assert.ok(markdownBefore.includes(`4. ${worksheet}`), 'Saved Markdown numbering and placeholders are preserved.');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
