import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POST } from '../app/api/runs/route';
import { readBody, RequestError } from '../lib/http';

function streamedBody(bytes: Uint8Array, chunkSize: number, headers: Record<string, string> = {}) {
  let offered = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offered === bytes.length) { controller.close(); return; }
      const end = Math.min(offered + chunkSize, bytes.length);
      controller.enqueue(bytes.subarray(offered, end));
      offered = end;
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const request = new Request('http://localhost/api/runs', {
    method: 'POST', headers: { origin: 'http://localhost', ...headers }, body, duplex: 'half',
  } as RequestInit);
  return { request, stats: () => ({ offered, cancelled }) };
}

const tooLarge = (error: unknown) => error instanceof RequestError && error.status === 413;

test('create route cancels oversized JSON before EOF without trusting Content-Length', async () => {
  const bytes = new Uint8Array(1024 * 1024).fill(65);
  const headerCases: Record<string, string>[] = [{}, { 'content-length': '1' }];
  for (const headers of headerCases) {
    const probe = streamedBody(bytes, 16_384, headers);
    const response = await POST(probe.request);
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'Request body is too large.' });
    assert.equal(probe.stats().cancelled, true);
    assert.ok(probe.stats().offered <= 250_000 + 16_384);
    assert.ok(probe.stats().offered < bytes.length);
  }
});

test('shared reader enforces management and default limits during streaming', async () => {
  for (const limit of [2_000, 16_000]) {
    const probe = streamedBody(new Uint8Array(limit * 3).fill(65), 256);
    await assert.rejects(limit === 16_000 ? readBody(probe.request) : readBody(probe.request, limit), tooLarge);
    assert.equal(probe.stats().cancelled, true);
    assert.ok(probe.stats().offered <= limit + 256);
  }
});

test('reader preserves character limits and UTF-8 split across byte chunks', async () => {
  const value = { text: 'å漢🐈' };
  const text = JSON.stringify(value);
  const bytes = new TextEncoder().encode('\uFEFF' + text);
  assert.ok(bytes.length > text.length);
  assert.deepEqual(await readBody(streamedBody(bytes, 1).request, text.length), value);
  const oversized = streamedBody(bytes, 1);
  await assert.rejects(readBody(oversized.request, text.length - 1), tooLarge);
  assert.equal(oversized.stats().cancelled, true);
});

test('reader checks the final decoded character at EOF', async () => {
  const bytes = new Uint8Array([34, 120, 34, 0xe2]); // A truncated UTF-8 sequence decodes to a replacement character.
  await assert.rejects(readBody(streamedBody(bytes, 1).request, 3), tooLarge);
});

test('empty bodies and valid JSON still work; malformed JSON retains its 400 error', async () => {
  assert.deepEqual(await readBody(new Request('http://localhost/api/runs', { method: 'POST' })), {});
  assert.deepEqual(await readBody(streamedBody(new TextEncoder().encode('{"ok":true}'), 2).request), { ok: true });
  await assert.rejects(readBody(streamedBody(new TextEncoder().encode('{invalid'), 2).request),
    (error: unknown) => error instanceof RequestError && error.status === 400 && error.message === 'Invalid JSON request.');
});

test('origin validation still runs before reading the body', async () => {
  const probe = streamedBody(new Uint8Array(100), 10, { origin: 'https://unrelated.example' });
  await assert.rejects(readBody(probe.request), (error: unknown) => error instanceof RequestError && error.status === 403);
  assert.equal(probe.stats().offered, 0);
});
