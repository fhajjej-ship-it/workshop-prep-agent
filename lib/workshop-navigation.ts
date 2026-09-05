import { preferredRunId } from './recent-runs';
import { z } from 'zod';
import { materialsSchema } from './material-input';
import { revisionInputSchema } from './revision-input';
import type { Brief, Material, PublicRun } from './types';

export type WorkshopLocation = { view: 'home'; runId?: never } | { view: 'brief'; runId?: string } | { view: 'workshop'; runId: string };

export function workshopLocation(search: string): WorkshopLocation {
  const runId = preferredRunId(search, null);
  if (new URLSearchParams(search).get('view') === 'brief') return runId ? { view: 'brief', runId } : { view: 'brief' };
  if (runId) return { view: 'workshop', runId };
  return { view: 'home' };
}

export function workshopPath(location: WorkshopLocation): string {
  if (location.view === 'workshop') return `/?run=${encodeURIComponent(location.runId)}`;
  return location.view === 'brief' ? `/?view=brief${location.runId ? `&run=${encodeURIComponent(location.runId)}` : ''}` : '/';
}

export const workshopDraftsStorageKey = 'workshop-prep-brief-drafts';
export const pendingWorkshopRevisionKey = 'workshop-prep-pending-revision';
export const editedWorkshopFeedback = 'Prepare an updated version using the current edited brief and selected materials as authoritative. Update the audience, goal, timing, activities, claims and references to match these inputs. Retain only previous content that remains appropriate.';
const briefDraftSchema = revisionInputSchema.extend({ brief: z.object({
  audience: z.string().max(300), objective: z.string().max(1200), durationMinutes: z.number().finite(),
  constraints: z.string().max(1600), format: z.enum(['', 'in-person', 'remote', 'hybrid']),
}).strict() });
export type WorkshopBriefDraft = z.infer<typeof briefDraftSchema>;
export type WorkshopBriefDrafts = Record<string, WorkshopBriefDraft>;

export function workshopDraftKey(runId?: string | null) { return runId ?? 'new'; }

export function parseWorkshopDrafts(raw: string | null): WorkshopBriefDrafts {
  try {
    const value: unknown = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([key, input]) => {
      if (key !== 'new' && preferredRunId('', key) !== key) return [];
      const parsed = briefDraftSchema.safeParse(input);
      return parsed.success ? [[key, parsed.data]] : [];
    }));
  } catch { return {}; }
}

export function workshopBriefDraft(brief: Brief, materials: Material[] = [], legacyInput: string | null = null): WorkshopBriefDraft {
  let legacy: z.infer<typeof revisionInputSchema> | undefined;
  try { const parsed = revisionInputSchema.safeParse(JSON.parse(legacyInput ?? 'null')); if (parsed.success) legacy = parsed.data; } catch { /* Keep the saved run as the starting point. */ }
  return { brief: { ...brief }, materials: (legacy?.materials ?? materials).map(item => ({ ...item })), feedback: legacy?.feedback ?? '', textDraft: legacy?.textDraft ?? { title: '', content: '' } };
}

export function canEditWorkshop(run: PublicRun | null): boolean {
  return Boolean(run?.pack && (run.status === 'completed' || run.status === 'failed'));
}

export function workshopPreparationRequest(input: WorkshopBriefDraft, runId?: string | null) {
  const draft = briefDraftSchema.parse(input);
  if (draft.textDraft.title || draft.textDraft.content) throw new Error('Add or discard the pasted material before preparing the workshop.');
  const materials = materialsSchema.parse(draft.materials);
  if (runId && draft.feedback.trim() && draft.feedback.trim().length < 5) throw new Error('Describe your requested changes in at least 5 characters, or leave that field blank.');
  return runId
    ? { url: `/api/runs/${encodeURIComponent(runId)}/revise`, body: { feedback: draft.feedback.trim() || editedWorkshopFeedback, brief: draft.brief, materials } }
    : { url: '/api/runs', body: { brief: draft.brief, materials } };
}

export function pendingWorkshopRevision(raw: string | null, sourceId?: string) {
  try {
    const value = JSON.parse(raw ?? 'null') as { id?: string; originalId?: string; parentId?: string } | null;
    if (!value?.id || preferredRunId('', value.id) !== value.id) return null;
    if (sourceId && value.originalId !== sourceId && value.parentId !== sourceId && value.id !== sourceId) return null;
    return value as { id: string; originalId?: string; parentId?: string };
  } catch { return null; }
}

export async function loadPendingWorkshopRevision(id: string, readRun: (id: string) => Promise<PublicRun>): Promise<PublicRun | null> {
  try { return await readRun(id); }
  catch (error) {
    // A deleted attempt must not block editing its preserved parent. Other
    // failures leave its state unknown, so do not start a competing attempt.
    if (error instanceof Error && 'status' in error && error.status === 404) return null;
    throw error;
  }
}
