import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { advanceRun, createRun, readRun } from './agent';
import { getConfig } from './config';
import { createDirectGoogleModel } from './direct-model';
import { RequestError } from './http';
import { getStore, LocalRunStore, validRunId, type RunStore } from './store';
import type { AppConfig, Brief, Run } from './types';

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

export async function createUiRun(brief: Brief): Promise<Run> {
  return createRun(brief, getStore(), getConfig());
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
  return await archivedUiRun(id) ?? readRun(id, await storeForRun(id));
}

export async function advanceUiRun(id: string, format?: Brief['format'], fetch?: FetchFunction): Promise<Run | null> {
  const archived = await archivedUiRun(id);
  if (archived) {
    if (archived.status === 'completed' || archived.status === 'failed') return archived;
    throw new RequestError('This historical test is read-only. Start a new local run to continue preparing a workshop.', 409);
  }
  const config = getConfig();
  const store = await storeForRun(id);
  if (!await store.read(id)) return null;
  return advanceRun(id, store, format, {
    config,
    ...(fetch && config.mode === 'live' ? { model: createDirectGoogleModel({ fetch }) } : {}),
  });
}
