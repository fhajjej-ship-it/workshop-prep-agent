import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { advanceRun, createRun, MAX_TOOL_CALLS, readRun, RUN_TIMEOUT_MS } from '../lib/agent';
import { getConfig, LIVE_MODEL } from '../lib/config';
import { materials } from '../lib/materials';
import { LocalRunStore } from '../lib/store';
import type { Brief, Run } from '../lib/types';

const brief: Brief = {
  audience: '12 executive leaders exploring AI',
  objective: 'Select one useful, low-risk AI experiment',
  durationMinutes: 90, constraints: 'Use only synthetic examples. No coding.', format: '',
};
const config = getConfig({ WORKSHOP_MODE: 'test', WORKSHOP_STORE: 'local' });
const liveConfig = { ...config, mode: 'live' as const, model: LIVE_MODEL };

class CapturingStore extends LocalRunStore {
  snapshots: Run[] = [];
  rejectToolSave = false;
  rejectedToolSave = false;

  override async save(run: Run) {
    if (this.rejectToolSave && run.currentAction?.phase === 'tool') {
      this.rejectedToolSave = true;
      throw new Error('Simulated metadata persistence failure');
    }
    await super.save(run);
    this.snapshots.push(structuredClone(run));
  }
}

async function withStore(fn: (store: CapturingStore, directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(process.cwd(), '.local-test-current-action-'));
  try { await fn(new CapturingStore(directory), directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('current action is persisted before each tool and cleared after pause, timing correction and completion', async () => {
  await withStore(async (store, directory) => {
    const run = await createRun(brief, store, config);
    const paused = await advanceRun(run.id, store, undefined, { config });
    assert.equal(paused.status, 'awaiting_input');
    assert.equal(paused.currentAction, null);
    assert.equal((await new LocalRunStore(directory).read(run.id))?.currentAction, null);

    const finished = await advanceRun(run.id, store, 'remote', { config });
    assert.equal(finished.status, 'completed', finished.error ?? 'Deterministic pack should complete');
    assert.equal(finished.currentAction, null);
    assert.equal((await new LocalRunStore(directory).read(run.id))?.currentAction, null);
    assert.equal(finished.revision, 2);
    assert.deepEqual(finished.events.filter(event => event.tool === 'validate_pack')
      .map(event => (event.output as { valid: boolean }).valid), [false, true]);
    assert.equal(finished.validation?.totalMinutes, brief.durationMinutes);

    for (const [eventIndex, event] of finished.events.entries()) {
      const toolIndex = store.snapshots.findIndex(snapshot =>
        snapshot.currentAction?.phase === 'tool' && snapshot.currentAction.tool === event.tool &&
        snapshot.events.length === eventIndex);
      assert.ok(toolIndex >= 0, `${event.tool} must have a persisted start before its event`);
      const before = store.snapshots[toolIndex];
      assert.equal(before.status, 'running');
      assert.equal(before.currentAction?.step, before.steps);
      assert.ok(Number.isFinite(Date.parse(before.currentAction!.startedAt)));
      const modelIndex = store.snapshots.findIndex(snapshot =>
        snapshot.currentAction?.phase === 'model' && snapshot.steps === before.steps);
      assert.ok(modelIndex >= 0 && modelIndex < toolIndex, 'Model start must precede tool start');
      assert.equal(store.snapshots[modelIndex].currentAction?.tool, undefined);
      assert.equal(store.snapshots[modelIndex].currentAction?.sourceId, undefined);
      const endIndex = store.snapshots.findIndex(snapshot => snapshot.events.some(saved => saved.id === event.id));
      assert.ok(endIndex > toolIndex);
      assert.equal(store.snapshots[endIndex].currentAction, null, 'Completed tool must clear its current action');
      if (event.tool === 'read_material') {
        const sourceId = (event.input as { id: string }).id;
        assert.equal(before.currentAction?.sourceId, sourceId);
        assert.ok(materials.some(source => source.id === sourceId));
        assert.ok(!before.readSourceIds.includes(sourceId), 'Read start must be saved before the source is read');
      } else {
        assert.equal(before.currentAction?.sourceId, undefined);
      }
      if (event.tool === 'draft_pack') {
        assert.equal(before.revision + 1, (event.output as { revision: number }).revision);
        if (before.revision === 0) assert.equal(before.pack, undefined);
        else assert.equal(before.validation?.valid, false, 'Correction starts after failed timing validation');
      }
    }
  });
});

test('model start is already stored when an injected provider runs, and provider failure clears it', async () => {
  await withStore(async store => {
    const run = await createRun({ ...brief, format: 'remote' }, store, liveConfig);
    let calls = 0;
    const duringModel: Run[] = [];
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      calls += 1;
      duringModel.push((await store.read(run.id))!);
      throw new Error('private-provider-detail');
    } });
    const failed = await advanceRun(run.id, store, undefined, { config: liveConfig, model });
    assert.equal(calls, 1);
    assert.equal(duringModel[0].status, 'running');
    assert.equal(duringModel[0].currentAction?.phase, 'model');
    assert.equal(duringModel[0].currentAction?.step, 1);
    assert.equal(duringModel[0].events.length, 0);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.currentAction, null);
    assert.equal((await store.read(run.id))?.currentAction, null);
    assert.equal(failed.events.length, 0);
    assert.ok(!JSON.stringify(failed).includes('private-provider-detail'));
  });
});

test('a failed pre-tool metadata save prevents the source read and clears the failed live run', async () => {
  await withStore(async store => {
    const run = await createRun({ ...brief, format: 'remote' }, store, liveConfig);
    store.rejectToolSave = true;
    const model = new MockLanguageModelV4({ doGenerate: async () => ({
      content: [{ type: 'tool-call', toolCallId: 'read-source', toolName: 'read_material', input: JSON.stringify({ id: materials[0].id }) }],
      finishReason: { unified: 'tool-calls', raw: undefined },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 0, text: 0, reasoning: undefined },
      },
      warnings: [],
    }) });
    const failed = await advanceRun(run.id, store, undefined, { config: liveConfig, model });
    assert.equal(store.rejectedToolSave, true);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.currentAction, null);
    assert.deepEqual(failed.readSourceIds, []);
    assert.equal(failed.events.length, 0, 'The failed metadata save must precede the tool action');
    assert.equal((await store.read(run.id))?.currentAction, null);
  });
});

test('step and tool limits clear current action without claiming a completed pack', async () => {
  await withStore(async store => {
    const run = await createRun({ ...brief, format: 'remote' }, store, config);
    const failed = await advanceRun(run.id, store, undefined, { config, maxSteps: 3 });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.steps, 3);
    assert.equal(failed.currentAction, null);
    assert.equal((await store.read(run.id))?.currentAction, null);
    assert.ok(!failed.events.some(event => event.tool === 'save_for_review'));

    const capped = await createRun({ ...brief, format: 'remote' }, store, config);
    capped.events = Array.from({ length: MAX_TOOL_CALLS }, (_, index) => ({
      id: `prior-${index}`, at: capped.createdAt, tool: 'search_materials', input: { query: 'workshop' }, output: {}, status: 'ok',
    }));
    await store.save(capped);
    const stopped = await advanceRun(capped.id, store, undefined, { config });
    assert.equal(stopped.status, 'failed');
    assert.equal(stopped.currentAction, null);
    assert.equal(stopped.events.length, MAX_TOOL_CALLS);
    assert.deepEqual(stopped.readSourceIds, []);
    assert.equal((await store.read(capped.id))?.currentAction, null);
  });
});

test('a tool action error clears its saved action and does not name an unknown source', async () => {
  await withStore(async store => {
    const run = await createRun({ ...brief, format: 'remote' }, store, liveConfig);
    let calls = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => {
      calls += 1;
      return {
        content: [{ type: 'tool-call', toolCallId: 'unknown-source', toolName: 'read_material', input: '{"id":"unknown-source"}' }],
        finishReason: { unified: 'tool-calls', raw: undefined },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 0, text: 0, reasoning: undefined },
        },
        warnings: [],
      };
    } });
    const failed = await advanceRun(run.id, store, undefined, { config: liveConfig, model });
    assert.equal(calls, 1);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.currentAction, null);
    assert.equal(failed.events[0].status, 'error');
    const toolStart = store.snapshots.find(snapshot => snapshot.currentAction?.phase === 'tool');
    assert.equal(toolStart?.currentAction?.tool, 'read_material');
    assert.equal(toolStart?.currentAction?.sourceId, undefined);
    assert.equal(store.snapshots.find(snapshot => snapshot.events.length === 1)?.currentAction, null);
    assert.equal((await store.read(run.id))?.currentAction, null);
  });
});

test('stale requests clear saved current action and legacy runs can omit the field', async () => {
  await withStore(async (store, directory) => {
    const run = await createRun({ ...brief, format: 'remote' }, store, config);
    delete run.currentAction;
    await store.save(run);
    assert.equal((await readRun(run.id, store))?.currentAction, undefined);
    const completed = await advanceRun(run.id, store, undefined, { config });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.currentAction, null);

    const stale = await createRun(brief, store, config);
    stale.status = 'running';
    stale.updatedAt = new Date(Date.now() - RUN_TIMEOUT_MS - 60_000).toISOString();
    stale.currentAction = { phase: 'tool', tool: 'read_material', sourceId: materials[0].id, step: 1, startedAt: stale.updatedAt };
    await writeFile(path.join(directory, `${stale.id}.json`), JSON.stringify(stale));
    const recovered = (await readRun(stale.id, store))!;
    assert.equal(recovered.status, 'failed');
    assert.equal(recovered.currentAction, null);
    assert.equal(recovered.events.length, 0);
    assert.equal((await store.read(stale.id))?.currentAction, null);
  });
});
