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
