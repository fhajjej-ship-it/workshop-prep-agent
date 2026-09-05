import { z } from 'zod';
import { materialsSchema, MAX_MATERIAL_CHARS } from './material-input';
import type { Material } from './types';

export const sourceRevisionFeedback = 'Update the workshop using the revised material selection. Preserve the audience, goal and timing; update activities, claims and references where the changed sources require it.';
export const revisionInputSchema = z.object({
  feedback: z.string().max(2000),
  materials: materialsSchema.or(z.tuple([])),
  textDraft: z.object({ title: z.string().max(180), content: z.string().max(MAX_MATERIAL_CHARS) }).strict(),
}).strict();
export type RevisionInputDraft = z.infer<typeof revisionInputSchema>;

export function sourceSelectionChanged(selected: Material[], previous: Material[]) {
  const snapshot = (items: Material[]) => JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, title, content, kind, filename, pageCount }) => ({ id, title, content, kind, filename, pageCount })));
  return snapshot(selected) !== snapshot(previous);
}

export function revisionInputRequest(input: RevisionInputDraft, previous: Material[]) {
  const draft = revisionInputSchema.parse(input);
  if (draft.textDraft.title || draft.textDraft.content) throw new Error('Add or discard your pasted text before rerunning.');
  const selected = materialsSchema.parse(draft.materials);
  const changed = sourceSelectionChanged(selected, previous);
  const feedback = draft.feedback.trim() || (changed ? sourceRevisionFeedback : '');
  if (feedback.length < 5) throw new Error('Describe a change in at least 5 characters, or update the selected materials.');
  return { feedback, ...(changed ? { materials: selected } : {}) };
}
