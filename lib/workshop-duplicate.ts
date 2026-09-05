import { randomUUID } from 'node:crypto';
import { getStorageConfig } from './config';
import { RequestError } from './http';
import { getRunMaterials } from './materials';
import { getStore, type RunStore } from './store';
import type { Run } from './types';
import { readUiRun } from './ui-live-test';
import { assertManagementOrigin, managementIdentity, renameWorkshopSchema } from './workshop-management';

export const duplicateWorkshopSchema = renameWorkshopSchema;

/** A copy is a new workshop with the saved content and its existing checks, never a new AI run. */
export async function createWorkshopCopy(source: Run, displayName: string, managementHash: string, store: RunStore): Promise<Run> {
  const input = duplicateWorkshopSchema.parse({ displayName, version: source.version });
  if (!['completed', 'failed'].includes(source.status) || !source.pack) {
    throw new RequestError('A saved workshop pack is required before duplicating. Wait for preparation to finish.', 409);
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const copy: Run = {
    id, workshopId: id, displayName: input.displayName, managementHash,
    copiedFrom: { runId: source.id, title: source.displayName || source.pack.title, updatedAt: source.updatedAt },
    createdAt: now, updatedAt: now, version: 0,
    status: source.status, mode: source.mode, model: source.model, workflowVersion: source.workflowVersion,
    brief: structuredClone(source.brief), materials: structuredClone(getRunMaterials(source)),
    pack: structuredClone(source.pack), revision: source.revision,
    validation: structuredClone(source.validation), contentReview: structuredClone(source.contentReview),
    clarificationResponse: structuredClone(source.clarificationResponse),
    error: source.status === 'failed' ? source.error : undefined,
    readSourceIds: [...source.readSourceIds], events: [], messages: [], steps: 0, currentAction: null,
  };
  await store.create(copy);
  return copy;
}

export async function duplicateWorkshop(request: Request, id: string, input: { displayName: string; version: number }) {
  assertManagementOrigin(request);
  const storage = getStorageConfig();
  if (!storage.ready) throw new RequestError(storage.blockers.join(' '), 503);
  const source = await readUiRun(id);
  if (!source) throw new RequestError('Workshop not found.', 404);
  if (source.version !== input.version) throw new RequestError('This workshop has changed. Reload before duplicating it.', 409);
  const identity = managementIdentity(request);
  const run = await createWorkshopCopy(source, input.displayName, identity.hash, getStore());
  return { run, token: identity.token };
}
