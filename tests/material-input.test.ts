import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  materialSchema, materialsSchema, MAX_MATERIALS, MAX_MATERIAL_CHARS,
  MAX_TOTAL_MATERIAL_CHARS, MAX_PDF_BYTES, MAX_PDF_PAGES,
} from '../lib/material-input';
import { assertSameOrigin, readBody, RequestError } from '../lib/http';

const material = { id: 'operations-handbook', title: 'Operations handbook', content: 'A supplied workshop reference with sufficient readable text.', kind: 'text' as const };

test('materials reject empty selection, duplicate IDs, unsafe IDs and unexpected fields', () => {
  assert.equal(materialsSchema.safeParse([material]).success, true);
  assert.equal(materialsSchema.safeParse([]).success, false);
  assert.equal(materialsSchema.safeParse([material, { ...material, title: 'Different title' }]).success, false);
  for (const id of ['../source', '[source]', 'source/name', 'Uppercase', 'two--hyphens', 'x'.repeat(81)]) {
    assert.equal(materialSchema.safeParse({ ...material, id }).success, false, id);
  }
  assert.equal(materialSchema.safeParse({ ...material, id: 'x'.repeat(80) }).success, true);
  assert.equal(materialSchema.safeParse({ ...material, arbitrary: true }).success, false);
  assert.equal(materialSchema.safeParse({ ...material, title: 'x'.repeat(181) }).success, false);
  assert.equal(materialSchema.safeParse({ ...material, content: 'x'.repeat(19) }).success, false);
  assert.equal(materialSchema.safeParse({ ...material, content: ' '.repeat(30) }).success, false);
});

test('material count, individual text, combined text and PDF page metadata stay bounded', () => {
  const selection = Array.from({ length: MAX_MATERIALS }, (_, index) => ({ ...material, id: `source-${index}` }));
  assert.equal(materialsSchema.safeParse(selection).success, true);
  assert.equal(materialsSchema.safeParse([...selection, { ...material, id: 'extra-source' }]).success, false);
  assert.equal(materialSchema.safeParse({ ...material, content: 'x'.repeat(MAX_MATERIAL_CHARS) }).success, true);
  assert.equal(materialSchema.safeParse({ ...material, content: 'x'.repeat(MAX_MATERIAL_CHARS + 1) }).success, false);
  const atTotal = [
    { ...material, id: 'source-one', content: 'x'.repeat(MAX_MATERIAL_CHARS) },
    { ...material, id: 'source-two', content: 'y'.repeat(MAX_TOTAL_MATERIAL_CHARS - MAX_MATERIAL_CHARS) },
  ];
  assert.equal(materialsSchema.safeParse(atTotal).success, true);
  assert.equal(materialsSchema.safeParse([...atTotal, { ...material, id: 'source-three' }]).success, false);
  assert.equal(MAX_PDF_BYTES, 3 * 1024 * 1024);
  assert.equal(materialSchema.safeParse({ ...material, kind: 'pdf', filename: 'handbook.pdf', pageCount: MAX_PDF_PAGES }).success, true);
  for (const pageCount of [0, 1.5, MAX_PDF_PAGES + 1]) {
    assert.equal(materialSchema.safeParse({ ...material, kind: 'pdf', pageCount }).success, false);
  }
});

test('run-sized JSON has an explicit limit and cross-origin bodies are rejected before reading', async () => {
  const body = JSON.stringify({ content: 'x'.repeat(20_000) });
  const request = () => new Request('http://localhost/api/runs', { method: 'POST', body });
  await assert.rejects(() => readBody(request()), (error: unknown) => error instanceof RequestError && error.status === 413);
  assert.deepEqual(await readBody(request(), 250_000), JSON.parse(body));
  await assert.rejects(() => readBody(new Request('http://localhost/api/runs', { method: 'POST', body: 'x'.repeat(250_001) }), 250_000),
    (error: unknown) => error instanceof RequestError && error.status === 413);
  const crossOrigin = new Request('http://localhost/api/materials/upload', {
    method: 'POST', headers: { origin: 'http://outside.example' }, body: 'unread body',
  });
  assert.throws(() => assertSameOrigin(crossOrigin), (error: unknown) => error instanceof RequestError && error.status === 403);
  assert.equal(crossOrigin.bodyUsed, false);
  assert.doesNotThrow(() => assertSameOrigin(new Request('http://localhost/api/materials/upload', { headers: { origin: 'http://localhost' } })));
});
