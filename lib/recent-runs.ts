import type { PublicRun } from './types';

export const currentRunStorageKey = 'workshop-prep-current-run';
export const recentRunsStorageKey = 'workshop-prep-recent-runs';
export const recentRunLimit = 10;

export type RecentRunSummary = {
  id: string;
  workshopId?: string;
  createdAt?: string;
  title: string;
  updatedAt: string;
  status: PublicRun['status'];
  revised: boolean;
};

const statuses = new Set<PublicRun['status']>(['ready', 'running', 'awaiting_input', 'completed', 'failed']);
const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validRunId(value: unknown): value is string {
  return typeof value === 'string' && runIdPattern.test(value);
}

function validSummary(value: unknown): value is RecentRunSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RecentRunSummary>;
  return validRunId(item.id) && typeof item.title === 'string' && item.title.trim().length > 0 && item.title.length <= 180
    && typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt))
    && (item.workshopId === undefined || validRunId(item.workshopId))
    && (item.createdAt === undefined || typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)))
    && typeof item.status === 'string' && statuses.has(item.status as PublicRun['status'])
    && (item.revised === undefined || typeof item.revised === 'boolean');
}

type WorkshopIdentity = { id: string; workshopId?: string; parentRunId?: string };

export function workshopFamilyId(run: WorkshopIdentity): string {
  return run.workshopId ?? run.parentRunId ?? run.id;
}

function summaryFields(item: RecentRunSummary): RecentRunSummary {
  return { id: item.id, ...(item.workshopId ? { workshopId: item.workshopId } : {}), ...(item.createdAt ? { createdAt: item.createdAt } : {}),
    title: item.title, updatedAt: item.updatedAt, status: item.status, revised: item.revised ?? false };
}

/** Preserve family recency order, but show its newest created attempt, never its most recently edited ancestor. */
export function consolidateRecentRuns(current: RecentRunSummary[], limit = recentRunLimit): RecentRunSummary[] {
  const families = new Map<string, RecentRunSummary>();
  for (const item of current) {
    const key = workshopFamilyId(item);
    const previous = families.get(key);
    if (!previous) { families.set(key, summaryFields(item)); continue; }
    const created = item.createdAt ? Date.parse(item.createdAt) : -Infinity;
    const previousCreated = previous.createdAt ? Date.parse(previous.createdAt) : -Infinity;
    const newer = item.id === previous.id
      ? Date.parse(item.updatedAt) > Date.parse(previous.updatedAt)
      : created > previousCreated || created === previousCreated && created !== -Infinity && item.id > previous.id;
    if (newer) families.set(key, summaryFields(item));
  }
  return [...families.values()].slice(0, Math.max(0, limit));
}

export function recentRunSummary(run: PublicRun, current: RecentRunSummary[] = []): RecentRunSummary {
  const known = current.find(item => item.id === run.id);
  const parent = current.find(item => item.id === run.parentRunId);
  const workshopId = run.workshopId ?? known?.workshopId ?? parent?.workshopId ?? workshopFamilyId(run);
  const family = current.find(item => workshopFamilyId(item) === workshopId || item.id === run.parentRunId);
  const title = (run.displayName || run.pack?.title || (run.parentRunId && family?.title) || run.brief.objective || 'Untitled workshop').trim().slice(0, 180);
  return { id: run.id, workshopId, createdAt: run.createdAt, title,
    updatedAt: run.updatedAt, status: run.status, revised: Boolean(run.parentRunId) };
}

export function parseRecentRuns(raw: string | null, limit = recentRunLimit): RecentRunSummary[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return consolidateRecentRuns(parsed.filter(validSummary), limit);
  } catch { return []; }
}

export function rememberRecentRun(current: RecentRunSummary[], run: PublicRun, limit = recentRunLimit): RecentRunSummary[] {
  const summary = recentRunSummary(run, current);
  // A just-created child can identify its legacy parent before the Home GET hydration finishes.
  const linked = current.map(item => item.id === run.id || item.id === run.parentRunId || item.id === summary.workshopId
    ? { ...item, workshopId: summary.workshopId } : item);
  return consolidateRecentRuns([summary, ...linked], limit);
}

export function hydrateRecentRuns(current: RecentRunSummary[], runs: PublicRun[], limit = recentRunLimit): RecentRunSummary[] {
  const hydrated = new Map(runs.map(run => [run.id, recentRunSummary(run, current)]));
  return consolidateRecentRuns(current.map(item => hydrated.get(item.id) ?? item), limit);
}

export function removeRecentWorkshop(current: RecentRunSummary[], target: WorkshopIdentity, currentRunId: string | null, knownRuns: WorkshopIdentity[] = []) {
  const family = workshopFamilyId(target);
  const belongs = (item: WorkshopIdentity) => workshopFamilyId(item) === family || item.id === family;
  const known = [target, ...current, ...knownRuns];
  const memberIds = new Set(known.filter(belongs).map(item => item.id));
  return {
    recent: current.filter(item => !belongs(item) && !memberIds.has(item.id)),
    clearCurrentRun: currentRunId === family || currentRunId !== null && memberIds.has(currentRunId),
  };
}

export function preferredRunId(search: string, legacyCurrentId: string | null): string | null {
  const linked = new URLSearchParams(search).get('run');
  if (validRunId(linked)) return linked;
  return validRunId(legacyCurrentId) ? legacyCurrentId : null;
}
