import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRun } from '../lib/agent';
import { getConfig } from '../lib/config';
import { createTestPack } from '../lib/test-pack';
import { LocalRunStore } from '../lib/store';
import { rememberRecentRun } from '../lib/recent-runs';
import { ownsWorkshop } from '../lib/workshop-management';
import { POST } from '../app/api/runs/[id]/duplicate/route';
import { DELETE, PATCH } from '../app/api/runs/[id]/route';

test('duplicate creates a named independent owned workshop without AI and preserves the saved original', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-duplicate-'));
  const previousDirectory = process.cwd();
  const previousEnvironment = process.env;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No network or model calls allowed.'); });
  const origin = 'http://127.0.0.1:3210';
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const callerToken = 'b'.repeat(43);
  const cookie = `workshop-management=${callerToken}`;
  const request = (id: string, body: unknown, method = 'POST', requestOrigin = origin) => new Request(`${origin}/api/runs/${id}/duplicate`, {
    method, headers: { origin: requestOrigin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    process.chdir(directory);
    process.env = { NODE_ENV: 'production', WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' };
    const store = new LocalRunStore();
    const source = await createRun({ audience: 'Team leads', objective: 'Choose one experiment.', durationMinutes: 30, constraints: 'Synthetic exercise.', format: 'remote' }, store, getConfig(), undefined, createHash('sha256').update('a'.repeat(43)).digest('hex'));
    source.status = 'completed'; source.pack = createTestPack(source.brief); source.revision = 2;
    source.parentRunId = randomUUID(); source.workshopId = source.parentRunId;
    source.revisionContext = { parentPack: structuredClone(source.pack) };
    source.feedback = 'Improve this original.';
    source.validation = { valid: true, issues: [], totalMinutes: 30 };
    source.messages = [{ role: 'user', content: 'Private source preparation history.' }];
    source.events = [{ id: randomUUID(), at: source.createdAt, tool: 'read_material', input: {}, output: {}, status: 'ok' }];
    source.readSourceIds = source.materials!.map(material => material.id);
    await store.save(source);
    const before = JSON.stringify(await store.read(source.id));
    process.env.WORKSHOP_MODE = 'live'; // Missing key must not block copying saved content.
    assert.equal(getConfig().ready, false);
    assert.equal(ownsWorkshop(request(source.id, {}), source), false);
    const response = await POST(request(source.id, { displayName: '  A separate team workshop  ', version: source.version }), context(source.id));
    assert.equal(response.status, 201);
    const payload = await response.json();
    const copy = (await store.read(payload.run.id))!;
    assert.equal(payload.canManage, true);
    assert.equal(copy.displayName, 'A separate team workshop');
    assert.equal(copy.workshopId, copy.id);
    assert.notEqual(copy.id, source.id);
    assert.equal(copy.parentRunId, undefined); assert.equal(copy.revisionContext, undefined); assert.equal(copy.feedback, undefined);
    assert.deepEqual(copy.pack, source.pack); assert.deepEqual(copy.materials, source.materials);
    assert.deepEqual(copy.validation, source.validation);
    assert.equal(copy.copiedFrom?.runId, source.id);
    assert.deepEqual(copy.messages, []); assert.deepEqual(copy.events, []);
    assert.equal('managementHash' in payload.run, false);
    assert.equal(ownsWorkshop(request(copy.id, {}), copy), true);
    assert.equal(rememberRecentRun(rememberRecentRun([], source), copy).length, 2);
    assert.equal(JSON.stringify(await store.read(source.id)), before);
    const renamed = await PATCH(request(copy.id, { displayName: 'Renamed copy', version: copy.version }, 'PATCH'), context(copy.id));
    assert.equal(renamed.status, 200);
    const renamedRun = (await renamed.json()).run;
    assert.equal((await DELETE(request(copy.id, { version: renamedRun.version }, 'DELETE'), context(copy.id))).status, 200);
    assert.equal(await store.read(copy.id), null);
    assert.equal(JSON.stringify(await store.read(source.id)), before);

    // Invalid names, stale selections, cross-origin requests and unfinished runs create no cards.
    for (const displayName of ['', ' ', 'x'.repeat(181), '\u0000invalid']) {
      assert.equal((await POST(request(source.id, { displayName, version: source.version }), context(source.id))).status, 400);
    }
    assert.equal((await POST(request(source.id, { displayName: 'Copy', version: source.version - 1 }), context(source.id))).status, 409);
    assert.equal((await POST(request(source.id, { displayName: 'Copy', version: source.version }, 'POST', 'https://elsewhere.example'), context(source.id))).status, 403);
    for (const status of ['ready', 'running', 'awaiting_input'] as const) {
      source.status = status; await store.save(source);
      assert.equal((await POST(request(source.id, { displayName: 'Copy', version: source.version }), context(source.id))).status, 409);
    }
    source.status = 'failed'; source.pack = undefined; await store.save(source);
    assert.equal((await POST(request(source.id, { displayName: 'Copy', version: source.version }), context(source.id))).status, 409);
    assert.equal((await readdir(path.join(directory, '.local', 'runs'))).length, 1);
    source.pack = createTestPack(source.brief); source.error = 'Stopped before content review.'; await store.save(source);
    const stoppedResponse = await POST(request(source.id, { displayName: 'Stopped copy', version: source.version }), context(source.id));
    assert.equal(stoppedResponse.status, 201);
    const stopped = (await stoppedResponse.json()).run;
    assert.equal(stopped.status, 'failed'); assert.equal(stopped.error, source.error);
  } finally {
    process.chdir(previousDirectory); process.env = previousEnvironment;
    await rm(directory, { recursive: true, force: true });
  }
});
