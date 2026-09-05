import { z } from 'zod';
import { materials } from './materials';
import type { Brief, Material, Validation, WorkshopPack } from './types';

export const briefSchema = z.object({
  audience: z.string().trim().min(3).max(300),
  objective: z.string().trim().min(10).max(1200),
  durationMinutes: z.number().int().min(30).max(240),
  constraints: z.string().trim().max(1600),
  format: z.enum(['', 'in-person', 'remote', 'hybrid']),
}).strict();

const sourceIds = z.array(z.string().max(100).describe('Maximum 100 characters. Use an exact source ID from the provided materials.')).max(12);
const text = z.string().max(3000).describe('Maximum 3000 characters for this field. Keep the content concise.');

// Structure is strict; content quality belongs to the feedback-producing tool.
export const packSchema = z.object({
  title: z.string().max(180).describe('Maximum 180 characters.'),
  outcome: text,
  agenda: z.array(z.object({
    title: z.string().max(180).describe('Maximum 180 characters.'),
    minutes: z.number().int().min(-240).max(480),
    activity: text,
    sourceIds,
  }).strict()).max(20),
  exercise: z.object({
    title: z.string().max(180).describe('Maximum 180 characters.'),
    instructions: z.array(text.describe('Maximum 3000 characters per instruction. Put any requested blank response template here, separate from the scenario and worked answer key.')).max(20),
    debrief: z.array(text).max(20),
    sourceIds,
    scenario: text.optional().describe('Maximum 3000 characters. Supply the actual case facts and participant inputs here; keep the blank template and answer key in their separate fields.'),
    expectedOutput: text.optional().describe('Maximum 3000 characters. Concisely name the outputs completed within the allocated exercise segment.'),
    sampleResponse: text.optional().describe('Maximum 3000 characters. Target at most 2400 characters for a compact, complete worked answer key. Retain every required answer and decision; refer to case identifiers without repeating scenario facts or blank templates.'),
    durationMinutes: z.number().int().min(1).max(240).optional(),
    agendaSectionIndex: z.number().int().min(0).max(19).optional().describe('Zero-based index of the agenda section hosting this exercise.'),
  }).strict(),
  facilitatorNotes: z.array(text.describe('Maximum 3000 characters per note. Every note must include at least one actual [source-id] citation whose ID is declared and was read, including setup or logistics notes.')).max(20),
  sources: z.array(z.object({
    id: z.string().max(100).describe('Maximum 100 characters. Use an exact provided source ID.'),
    title: z.string().max(180).describe('Maximum 180 characters. Use the exact provided source title.'),
  }).strict()).max(12),
  sourceClaims: z.array(z.object({
    claim: z.string().max(1000).describe('Maximum 1000 characters.'),
    sourceId: z.string().max(100).describe('Maximum 100 characters. Use an exact declared and read source ID.'),
    quote: z.string().max(1200).describe('Maximum 1200 characters. Use an exact supporting passage from the cited material.'),
  }).strict()).max(8).optional(),
}).strict();

export function validatePack(
  pack: WorkshopPack,
  brief: Brief,
  readSourceIds: string[],
  suppliedMaterials: Material[] = materials,
  options: { requireDeliverableFields?: boolean } = {},
): Validation {
  const issues: string[] = [];
  const known = new Map(suppliedMaterials.map((material) => [material.id, material]));
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

  if (options.requireDeliverableFields !== false) {
    adequate(pack.exercise.scenario ?? '', 60, 'Exercise scenario');
    adequate(pack.exercise.expectedOutput ?? '', 30, 'Exercise expected output');
    adequate(pack.exercise.sampleResponse ?? '', 60, 'Exercise sample response');
    if (!Number.isInteger(pack.exercise.durationMinutes) || (pack.exercise.durationMinutes ?? 0) <= 0 || pack.exercise.durationMinutes! > brief.durationMinutes) {
      issues.push('Exercise needs a positive whole-minute duration within the workshop agenda.');
    }
    const sectionIndex = pack.exercise.agendaSectionIndex;
    if (!Number.isInteger(sectionIndex) || sectionIndex! < 0 || sectionIndex! >= pack.agenda.length) {
      issues.push('Exercise must link to an existing agenda section using a zero-based agendaSectionIndex.');
    } else if (pack.exercise.durationMinutes! > pack.agenda[sectionIndex!].minutes) {
      issues.push(`Exercise duration exceeds its linked agenda section ${sectionIndex! + 1}: ${pack.exercise.durationMinutes} minutes must fit within ${pack.agenda[sectionIndex!].minutes} minutes.`);
    }
    if (!pack.sourceClaims?.length) issues.push('Include at least one source-supported claim with its exact supporting passage; workshop activities are proposed design.');
  }
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  pack.sourceClaims?.forEach((claim, index) => {
    const label = `Source-supported claim ${index + 1}`;
    adequate(claim.claim, 20, `${label} statement`);
    adequate(claim.quote, 20, `${label} passage`);
    checkReferences([claim.sourceId], label);
    const source = known.get(claim.sourceId);
    if (source && !normalize(source.content).includes(normalize(claim.quote))) {
      issues.push(`${label} passage must occur in its supplied source. Quote matching does not establish that the passage supports the claim.`);
    }
  });

  if (pack.facilitatorNotes.length < 2) issues.push('Facilitator notes need at least two substantive notes.');
  pack.facilitatorNotes.forEach((note, index) => {
    adequate(note, 20, `Facilitator note ${index + 1}`);
    const references = Array.from(note.matchAll(/\[([^\]\n]+)\]/g), (match) => match[1]);
    // Separate statements in a note may legitimately cite the same source.
    checkReferences([...new Set(references)], `Facilitator note ${index + 1}`);
  });

  return { valid: issues.length === 0, totalMinutes, issues };
}
