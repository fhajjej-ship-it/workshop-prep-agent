import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { advanceRun, createRun, createRunTools } from '../lib/agent';
import { getConfig } from '../lib/config';
import { packMarkdown, packProvenance } from '../lib/download';
import { getRunMaterials, materials, usesExampleMaterials } from '../lib/materials';
import { LocalRunStore } from '../lib/store';
import { createTestPack } from '../lib/test-pack';
import type { Brief, Material, Run } from '../lib/types';
import { validatePack } from '../lib/validation';

const brief: Brief = {
  audience: 'Workshop facilitators', objective: 'Prepare a session using the supplied operations references.',
  durationMinutes: 90, constraints: 'Keep the instructions clear.', format: '',
};
const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const custom: Material[] = [
  { id: 'operations-manual', title: 'Operations manual', content: 'Workshop source one: the original operations manual content.', kind: 'text' },
  { id: 'participant-guide', title: 'Participant guide', content: 'Workshop source two: the original participant guide content.', kind: 'pdf', filename: 'guide.pdf', pageCount: 2 },
];

async function withStore(fn: (store: LocalRunStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(process.cwd(), '.local-test-materials-'));
  try { await fn(new LocalRunStore(directory), directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('custom material snapshots survive changed selections and a fresh-store clarification resume', async () => withStore(async (store, directory) => {
  const selection = structuredClone(custom);
  const run = await createRun(brief, store, config, selection);
  selection[0].title = 'A different selection';
  selection[0].content = 'Changed content for a different workshop preparation.';
  assert.deepEqual(run.materials, custom);
  const paused = await advanceRun(run.id, store, undefined, { config });
  assert.equal(paused.status, 'awaiting_input');
  const nextRun = await createRun(brief, store, config, selection);
  assert.notEqual(nextRun.materials?.[0].content, paused.materials?.[0].content);
  const completed = await advanceRun(run.id, new LocalRunStore(directory), 'remote', { config });
  assert.equal(completed.status, 'completed', completed.error ?? 'The custom-material run should finish.');
  assert.equal(completed.revision, 2);
  assert.deepEqual(completed.materials, custom);
  assert.deepEqual(completed.readSourceIds, custom.map(source => source.id));
  assert.deepEqual(completed.pack?.sources, custom.map(({ id, title }) => ({ id, title })));
  const search = completed.events.find(event => event.tool === 'search_materials')!;
  assert.deepEqual((search.output as { matches: { id: string }[] }).matches.map(source => source.id), custom.map(source => source.id));
  const reads = completed.events.filter(event => event.tool === 'read_material');
  assert.deepEqual(reads.map(event => (event.output as Material).content), custom.map(source => source.content));
  const initialPrompt = JSON.stringify(completed.messages[0]);
  assert.ok(initialPrompt.includes(custom[0].title));
  assert.ok(!initialPrompt.includes(materials[0].title));
  assert.match(completed.pack!.outcome, /scripted fixture does not interpret or derive its workshop content from the supplied documents/);
  assert.match(completed.pack!.facilitatorNotes[0], /citation wiring only/);
}));

test('custom citations must be supplied, read and declared with their exact snapshot titles', () => {
  const fullBrief = { ...brief, format: 'remote' as const };
  const pack = createTestPack(fullBrief, { materials: custom });
  const readIds = custom.map(source => source.id);
  assert.deepEqual(validatePack(pack, fullBrief, readIds, custom), { valid: true, totalMinutes: 90, issues: [] });
  assert.equal(validatePack(pack, fullBrief, readIds).valid, false, 'Bundled materials cannot validate a custom citation.');
  const unread = validatePack(pack, fullBrief, [custom[0].id], custom);
  assert.match(unread.issues.join(' '), /was not read|that was not read/);
  const unprovided = structuredClone(pack);
  unprovided.sources.push({ id: materials[0].id, title: materials[0].title });
  unprovided.agenda[0].sourceIds.push(materials[0].id);
  assert.match(validatePack(unprovided, fullBrief, [...readIds, materials[0].id], custom).issues.join(' '), /Unknown declared source|cites unknown source/);
  const misnamed = structuredClone(pack);
  misnamed.sources[0].title = 'Different document';
  assert.match(validatePack(misnamed, fullBrief, readIds, custom).issues.join(' '), /must exactly match/);
});

test('a run cannot read bundled or other-run materials that were not selected', async () => withStore(async store => {
  const run = await createRun({ ...brief, format: 'remote' }, store, config, [custom[0]]);
  run.status = 'running';
  await store.save(run);
  const tools = createRunTools(run, store);
  for (const id of [materials[0].id, custom[1].id]) {
    await assert.rejects(async () => tools.read_material.execute!({ id }, { toolCallId: `read-${id}`, messages: [], context: {} }), /Unknown source ID/);
  }
  assert.deepEqual(run.readSourceIds, []);
  assert.ok(run.events.every(event => event.status === 'error'));
}));

test('omitted materials snapshot examples, explicit empty selection is rejected, and legacy runs remain compatible', async () => withStore(async store => {
  const run = await createRun(brief, store, config);
  assert.deepEqual(run.materials, materials);
  assert.notEqual(run.materials, materials);
  await assert.rejects(() => createRun(brief, store, config, []), /at least one material/i);
  delete run.materials;
  await store.save(run);
  assert.deepEqual(getRunMaterials(run), materials);
  const paused = await advanceRun(run.id, store, undefined, { config });
  assert.equal(paused.status, 'awaiting_input');
  const completed = await advanceRun(run.id, store, 'remote', { config });
  assert.equal(completed.status, 'completed', completed.error ?? 'The legacy run should finish.');
  assert.equal(completed.materials, undefined, 'Reading a legacy run does not relabel its evidence.');
  assert.equal(packProvenance(completed).synthetic, true);
  assert.match(packMarkdown(completed), /Synthetic standalone prototype/);
  assert.match(packMarkdown(completed), /Provided synthetic sources/);
}));

test('custom live exports avoid blanket synthetic-source claims while scripted exports stay explicit', () => {
  const run: Run = {
    id: 'export-fixture', brief: { ...brief, format: 'remote' }, mode: 'live', model: 'mock-model',
    materials: custom, pack: createTestPack({ ...brief, format: 'remote' }, { materials: custom }),
    revision: 2, validation: { valid: true, totalMinutes: 90, issues: [] },
    createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z', status: 'completed',
    events: [], steps: 0, readSourceIds: custom.map(source => source.id), messages: [], version: 0,
  };
  assert.deepEqual(packProvenance(run), { synthetic: false, humanReviewRequired: true, liveModelUsed: true, sourceKind: 'supplied' });
  const markdown = packMarkdown(run);
  assert.match(markdown, /Workshop preparation from supplied materials/);
  assert.match(markdown, /## Supplied sources/);
  assert.doesNotMatch(markdown, /Synthetic standalone prototype|Provided synthetic sources/);
  const scripted = { ...run, mode: 'test' as const, model: null };
  assert.equal(packProvenance(scripted).synthetic, true);
  assert.match(packMarkdown(scripted), /Content is not derived from the supplied documents/);
  assert.match(packMarkdown(scripted), /No live model was used/);
  assert.equal(usesExampleMaterials([{ ...materials[0], content: custom[0].content, kind: 'example' }]), false, 'Caller metadata cannot mark arbitrary content as a bundled example.');
});
