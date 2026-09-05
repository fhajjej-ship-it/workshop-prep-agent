import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { advanceRun, createRun, createRevisionRun, readRun } from './agent';
import type { ContentReviewer } from './content-review';
import { getConfig, getStorageConfig } from './config';
import { createDirectGoogleModel } from './direct-model';
import { RequestError } from './http';
import { getStore, LocalRunStore, validRunId, type RunStore } from './store';
import { resolveWorkshopId } from './workshop-lineage';
import type { AppConfig, Brief, Material, Run } from './types';

// The former UI allowance is an archive. Reading it never seals or rewrites evidence.
async function archivedUiRun(id: string): Promise<Run | null> {
  if (!validRunId(id)) return null;
  const configured = process.env.WORKSHOP_UI_TEST_DIR;
  const directory = configured && path.isAbsolute(configured)
    ? configured : path.join(process.cwd(), '.local', 'direct-google-ui-test-1');
  let claim: { runId?: string };
  try { claim = JSON.parse(await readFile(path.join(directory, 'claim.json'), 'utf8')); }
  catch { return null; }
  if (claim?.runId !== id) return null;
  return new LocalRunStore(path.join(directory, 'runs')).read(id);
}

export function getUiConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return getConfig(env);
}

export async function createUiRun(brief: Brief, materials?: Material[], managementHash?: string): Promise<Run> {
  return createRun(brief, getStore(), getConfig(), materials, managementHash);
}

export async function createUiRevision(id: string, feedback: string, managementHash?: string, selectedMaterials?: Material[], updatedBrief?: Brief): Promise<Run> {
  const original = await readUiRun(id);
  if (!original) throw new RequestError('Run not found.', 404);
  return createRevisionRun(original, feedback, getStore(), getConfig(), managementHash, selectedMaterials, updatedBrief);
}

export async function isArchivedUiRun(id: string): Promise<boolean> {
  return Boolean(await archivedUiRun(id));
}

export async function mutableUiRun(id: string): Promise<{ run: Run; store: RunStore }> {
  if (!validRunId(id)) throw new RequestError('Run not found.', 404);
  if (await isArchivedUiRun(id)) throw new RequestError('This historical workshop is read-only.', 403);
  const config = getStorageConfig();
  if (!config.ready) throw new RequestError(config.blockers.join(' '), 503);
  const store = await storeForRun(id);
  const run = await store.read(id);
  if (!run) throw new RequestError('Run not found.', 404);
  return { run, store };
}

async function storeForRun(id: string): Promise<RunStore> {
  if (getConfig().storage === 'postgres') {
    // Runs created before the storage switch stay in their original local store.
    const local = new LocalRunStore();
    if (await local.read(id)) return local;
  }
  return getStore();
}

export async function readUiRun(id: string): Promise<Run | null> {
  const run = await archivedUiRun(id) ?? await readRun(id, await storeForRun(id));
  if (!run) return null;
  const workshopId = await resolveWorkshopId(run, async parentId =>
    await archivedUiRun(parentId) ?? (await storeForRun(parentId)).read(parentId));
  return { ...run, workshopId };
}

export async function advanceUiRun(id: string, format?: Brief['format'], fetch?: FetchFunction, answer?: string, reviewer?: ContentReviewer): Promise<Run | null> {
  const archived = await archivedUiRun(id);
  if (archived) {
    if (archived.status === 'completed' || archived.status === 'failed') return archived;
    throw new RequestError('This historical test is read-only. Start a new local run to continue preparing a workshop.', 409);
  }
  const config = getConfig();
  const store = await storeForRun(id);
  if (!await store.read(id)) return null;
  return advanceRun(id, store, format, {
    config, answer, reviewer,
    ...(fetch && config.mode === 'live' ? { model: createDirectGoogleModel({ fetch }) } : {}),
  });
}
