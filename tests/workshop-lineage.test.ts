import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRevisionRun, createRun } from '../lib/agent';
import { getConfig } from '../lib/config';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief } from '../lib/types';
import { readUiRun } from '../lib/ui-live-test';
import { resolveWorkshopId } from '../lib/workshop-lineage';

const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const brief: Brief = { audience: 'Eight facilitators', objective: 'Choose an experiment and its owner.', durationMinutes: 30, constraints: '', format: 'remote' };

test('revisions keep one workshop identity and name while new workshops and ownership remain separate', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-lineage-'));
  try {
    const store = new LocalRunStore(directory);
    const original = await createRun(brief, store, config, undefined, 'original-owner');
    const separate = await createRun(brief, store, config);
    assert.equal(original.workshopId, original.id);
    assert.equal(separate.workshopId, separate.id);
    assert.notEqual(original.workshopId, separate.workshopId, 'Identical briefs are not enough to combine independent workshops.');
    original.displayName = 'Facilitator planning';
    original.status = 'completed';
    original.pack = createTestPack(brief);
    await store.save(original);
    const before = JSON.stringify(await store.read(original.id));
    const revised = await createRevisionRun(original, 'Shorten the introduction.', store, config, 'revision-owner');
    assert.equal(revised.workshopId, original.id);
    assert.equal(revised.parentRunId, original.id);
    assert.equal(revised.displayName, original.displayName);
    assert.equal(revised.managementHash, 'revision-owner');
    revised.status = 'failed';
    revised.pack = createTestPack(brief);
    await store.save(revised);
    const revisedBefore = JSON.stringify(await store.read(revised.id));
    const retry = await createRevisionRun(revised, 'Complete the exercise worksheet.', store, config);
    assert.equal(retry.workshopId, original.id);
    assert.equal(retry.parentRunId, revised.id);
    assert.equal(retry.displayName, original.displayName);
    assert.equal(JSON.stringify(await store.read(original.id)), before);
    assert.equal(JSON.stringify(await store.read(revised.id)), revisedBefore);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('older revision chains resolve on read without changing any saved record', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workshop-legacy-lineage-'));
  const previousDirectory = process.cwd();
  const previousEnvironment = process.env;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No network is allowed in this test.'); });
  try {
    process.chdir(directory);
    process.env = { NODE_ENV: 'test', WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' };
    const store = new LocalRunStore();
    const original = await createRun(brief, store, config);
    delete original.workshopId;
    original.status = 'completed';
    original.pack = createTestPack(brief);
    await store.save(original);
    const child = await createRevisionRun(original, 'Shorten the opening activity.', store, config);
    delete child.workshopId;
    child.status = 'completed';
    child.pack = createTestPack(brief);
    await store.save(child);
    const grandchild = await createRevisionRun(child, 'Improve the exercise output.', store, config);
    assert.equal(grandchild.workshopId, original.id, 'New revisions of legacy chains retain the true original identity.');
    delete grandchild.workshopId;
    await store.save(grandchild);
    const ids = [original.id, child.id, grandchild.id];
    const before = await Promise.all(ids.map(async id => JSON.stringify(await store.read(id))));
    for (const id of ids) assert.equal((await readUiRun(id))?.workshopId, original.id);
    assert.deepEqual(await Promise.all(ids.map(async id => JSON.stringify(await store.read(id)))), before);
  } finally {
    process.chdir(previousDirectory);
    process.env = previousEnvironment;
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing parents remain a shared identity and corrupt cycles terminate', async () => {
  const child = { id: 'child', parentRunId: 'missing-original' };
  assert.equal(await resolveWorkshopId(child, async () => null), 'missing-original');
  let reads = 0;
  const cyclic = { id: 'parent', parentRunId: 'child' };
  assert.equal(await resolveWorkshopId({ ...child, parentRunId: 'parent' }, async () => { reads++; return cyclic; }), 'child');
  assert.equal(reads, 1);
});
