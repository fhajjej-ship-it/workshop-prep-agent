import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { PDFParse } from 'pdf-parse';
import { exampleWorkshopRun } from '../lib/example-workshop';
import { hasCurrentContentReview } from '../lib/content-review';
import { briefSchema, validatePack } from '../lib/validation';
import { materialsSchema } from '../lib/material-input';
import { GET } from '../app/api/example/download/route';

test('the bundled example keeps its real review and accepted, independently editable inputs', () => {
  const run = { ...exampleWorkshopRun, messages: [] };
  assert.equal(run.status, 'completed');
  assert.equal(run.mode, 'live');
  assert.equal(hasCurrentContentReview(run), true);
  assert.equal(validatePack(run.pack, run.brief, run.readSourceIds, run.materials, { requireDeliverableFields: true }).valid, true);
  briefSchema.parse(run.brief);
  const inputs = materialsSchema.parse(run.materials);
  inputs[0].content = 'Edited copy';
  assert.notEqual(inputs[0].content, run.materials[0].content);
  assert.ok(run.materials.every(material => /fictional/i.test(material.content)));
  assert.equal('managementHash' in exampleWorkshopRun, false);
  assert.equal('messages' in exampleWorkshopRun, false);
});

test('example downloads are complete PDF and editable Word without creating a run', async () => {
  const original = JSON.stringify(exampleWorkshopRun);
  assert.equal((await GET(new Request('http://localhost/api/example/download?format=json'))).status, 400);
  const pdf = await GET(new Request('http://localhost/api/example/download?format=pdf'));
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('Content-Type'), 'application/pdf');
  const parser = new PDFParse({ data: new Uint8Array(await pdf.arrayBuffer()) });
  let pdfText: string;
  try { pdfText = (await parser.getText()).text; }
  finally { await parser.destroy(); }
  const word = await GET(new Request('http://localhost/api/example/download?format=docx'));
  assert.equal(word.status, 200);
  assert.match(word.headers.get('Content-Type') ?? '', /wordprocessingml/);
  const zip = await JSZip.loadAsync(await word.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const wordText = xml.replace(/<[^>]+>/g, '');
  for (const text of [pdfText, wordText]) {
    const content = text.replace(/\s+/g, ' ');
    assert.match(content, /Northlight Supply AI Pilot Selection Workshop/);
    assert.match(content, /Service Lead/);
    assert.match(content, /Facilitator notes/);
    assert.match(content, /Northlight fictional pilot decision rules/);
  }
  assert.equal(JSON.stringify(exampleWorkshopRun), original);
});
