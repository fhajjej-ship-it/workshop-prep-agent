import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from '../app/api/materials/upload/route';
import { extractMaterial } from '../lib/material-upload';
import { MAX_MATERIAL_CHARS, MAX_PDF_BYTES, MAX_PDF_PAGES } from '../lib/material-input';
import { pdfFixture } from './fixtures/pdf';

const sourceText = 'Synthetic facilitator notes: compare two options, name a decision owner, and agree on a next step.';

test('multipart PDF upload returns the actual extracted source text and provenance', async () => {
  const form = new FormData();
  form.set('file', new File([pdfFixture(sourceText)], 'Facilitator notes.pdf', { type: 'application/pdf' }));
  const response = await POST(new Request('http://localhost/api/materials/upload', { method: 'POST', body: form, headers: { origin: 'http://localhost' } }));
  assert.equal(response.status, 200);
  const { material } = await response.json();
  assert.equal(material.kind, 'pdf');
  assert.equal(material.title, 'Facilitator notes');
  assert.equal(material.pageCount, 1);
  assert.ok(material.content.includes(sourceText));
  assert.match(material.id, /^source-[0-9a-f-]+$/);
});

test('text uploads retain readable text; unsupported, empty and scanned documents fail clearly', async () => {
  const material = await extractMaterial(new File([sourceText], 'notes.md', { type: 'text/markdown' }));
  assert.equal(material.content, sourceText);
  assert.equal(material.kind, 'text');
  await assert.rejects(extractMaterial(new File([sourceText], 'notes.docx')), /PDF, TXT or Markdown/);
  await assert.rejects(extractMaterial(new File([''], 'notes.txt')), /empty/);
  await assert.rejects(extractMaterial(new File([pdfFixture('')], 'scan.pdf')), /scanned document/);
  await assert.rejects(extractMaterial(new File(['not a PDF'], 'notes.pdf')), /not a readable PDF/);
});

test('uploads reject page, byte and text limits instead of silently truncating', async () => {
  await assert.rejects(extractMaterial(new File([pdfFixture(sourceText, MAX_PDF_PAGES + 1)], 'long.pdf')), /pages or fewer/);
  await assert.rejects(extractMaterial(new File(['x'.repeat(MAX_MATERIAL_CHARS + 1)], 'long.txt')), /shorter excerpt/);
  await assert.rejects(extractMaterial(new File([new Uint8Array(MAX_PDF_BYTES + 1)], 'large.pdf')), /smaller than 3 MB/);
  const rejected = await POST(new Request('http://localhost/api/materials/upload', { method: 'POST', headers: { origin: 'https://unrelated.example', 'content-type': 'multipart/form-data; boundary=test' }, body: '' }));
  assert.equal(rejected.status, 403);
});
