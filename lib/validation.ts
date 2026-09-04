import { z } from 'zod';
import { materials } from './materials';
import type { Brief, Validation, WorkshopPack } from './types';

export const briefSchema = z.object({
  audience: z.string().trim().min(3).max(300),
  objective: z.string().trim().min(10).max(1200),
  durationMinutes: z.number().int().min(30).max(240),
  constraints: z.string().trim().max(1600),
  format: z.enum(['', 'in-person', 'remote', 'hybrid']),
}).strict();

const sourceIds = z.array(z.string().max(100)).max(12);
const text = z.string().max(3000);

// Structure is strict; content quality belongs to the feedback-producing tool.
export const packSchema = z.object({
  title: z.string().max(180),
  outcome: text,
  agenda: z.array(z.object({
    title: z.string().max(180),
    minutes: z.number().int().min(-240).max(480),
    activity: text,
    sourceIds,
  }).strict()).max(20),
  exercise: z.object({
    title: z.string().max(180),
    instructions: z.array(text).max(20),
    debrief: z.array(text).max(20),
    sourceIds,
  }).strict(),
  facilitatorNotes: z.array(text).max(20),
  sources: z.array(z.object({
    id: z.string().max(100),
    title: z.string().max(180),
  }).strict()).max(12),
}).strict();

export function validatePack(
  pack: WorkshopPack,
  brief: Brief,
  readSourceIds: string[],
): Validation {
  const issues: string[] = [];
  const known = new Map(materials.map((material) => [material.id, material]));
  const read = new Set(readSourceIds);
  const declared = new Set<string>();
  const totalMinutes = pack.agenda.reduce((total, item) => total + item.minutes, 0);

  const adequate = (value: string, minimum: number, label: string) => {
    if (value.trim().length < minimum) issues.push(`${label} needs substantive content (at least ${minimum} characters).`);
  };

  adequate(pack.title, 5, 'Pack title');
  adequate(pack.outcome, 20, 'Workshop outcome');
  if (pack.agenda.length < 3) issues.push('Agenda needs at least three sections: framing, practice and review.');
  if (totalMinutes !== brief.durationMinutes) {
    issues.push(`Agenda totals ${totalMinutes} minutes; must equal the brief's ${brief.durationMinutes} minutes exactly. Revise the timings.`);
  }
  if (pack.sources.length === 0) issues.push('Declare the source materials used in the pack.');

  for (const source of pack.sources) {
    if (declared.has(source.id)) issues.push(`Duplicate declared source ID: ${source.id}.`);
    declared.add(source.id);
    const material = known.get(source.id);
    if (!material) issues.push(`Unknown declared source ID: ${source.id}.`);
    else if (source.title !== material.title) issues.push(`Source title for ${source.id} must exactly match the provided material title.`);
    if (!read.has(source.id)) issues.push(`Source ${source.id} was not read by this run. Read it before citing it.`);
  }

  const checkReferences = (ids: string[], label: string) => {
    if (ids.length === 0) issues.push(`${label} needs at least one source reference.`);
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push(`${label} has duplicate source reference ${id}.`);
      seen.add(id);
      if (!known.has(id)) issues.push(`${label} cites unknown source ${id}.`);
      if (!declared.has(id)) issues.push(`${label} cites undeclared source ${id}.`);
      if (!read.has(id)) issues.push(`${label} cites source ${id} that was not read by this run.`);
    }
  };

  pack.agenda.forEach((item, index) => {
    const label = `Agenda section ${index + 1}`;
    adequate(item.title, 3, `${label} title`);
    adequate(item.activity, 20, `${label} activity`);
    if (!Number.isInteger(item.minutes) || item.minutes <= 0) issues.push(`${label} needs a positive whole-minute duration.`);
    checkReferences(item.sourceIds, label);
  });

  adequate(pack.exercise.title, 5, 'Exercise title');
  if (pack.exercise.instructions.length < 3) issues.push('Exercise needs at least three actionable instructions.');
  pack.exercise.instructions.forEach((instruction, index) => adequate(instruction, 20, `Exercise instruction ${index + 1}`));
  if (pack.exercise.debrief.length < 2) issues.push('Exercise needs at least two debrief questions.');
  pack.exercise.debrief.forEach((question, index) => adequate(question, 15, `Debrief question ${index + 1}`));
  checkReferences(pack.exercise.sourceIds, 'Exercise');

  if (pack.facilitatorNotes.length < 2) issues.push('Facilitator notes need at least two substantive notes.');
  pack.facilitatorNotes.forEach((note, index) => {
    adequate(note, 20, `Facilitator note ${index + 1}`);
    const references = Array.from(note.matchAll(/\[([^\]\n]+)\]/g), (match) => match[1]);
    checkReferences(references, `Facilitator note ${index + 1}`);
  });

  return { valid: issues.length === 0, totalMinutes, issues };
}
