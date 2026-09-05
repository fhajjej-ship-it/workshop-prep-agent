import type { Run } from './types';

type WorkshopLineage = Pick<Run, 'id' | 'workshopId' | 'parentRunId'>;

// Older records have parent links but no stable workshop identity. Resolve them
// without rewriting the saved attempts or making their titles an identity key.
export async function resolveWorkshopId(run: WorkshopLineage, read: (id: string) => Promise<WorkshopLineage | null>): Promise<string> {
  const seen = new Set<string>();
  let current = run;
  for (let depth = 0; depth < 64; depth++) {
    if (current.workshopId) return current.workshopId;
    if (seen.has(current.id)) return run.id;
    seen.add(current.id);
    if (!current.parentRunId) return current.id;
    if (seen.has(current.parentRunId)) return run.id;
    const parent = await read(current.parentRunId);
    // A deleted parent still provides a shared identity for its saved revisions.
    if (!parent) return current.parentRunId;
    current = parent;
  }
  return run.id;
}
