import { z } from 'zod';

export const MAX_MATERIALS = 3;
export const MAX_MATERIAL_CHARS = 20_000;
export const MAX_TOTAL_MATERIAL_CHARS = 40_000;
export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const MAX_PDF_PAGES = 20;

export const materialSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase source ID containing letters, numbers and single hyphens.'),
  title: z.string().trim().min(1).max(180),
  content: z.string().min(20).max(MAX_MATERIAL_CHARS).refine(value => value.trim().length >= 20, 'Material needs at least 20 characters of text.'),
  kind: z.enum(['example', 'pdf', 'text']).optional(),
  filename: z.string().trim().min(1).max(255).optional(),
  pageCount: z.number().int().min(1).max(MAX_PDF_PAGES).optional(),
}).strict();

export const materialsSchema = z.array(materialSchema).min(1, 'Add at least one material.').max(MAX_MATERIALS).superRefine((sources, context) => {
  const ids = new Set<string>();
  sources.forEach((source, index) => {
    if (ids.has(source.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Material IDs must be unique.' });
    ids.add(source.id);
  });
  if (sources.reduce((total, source) => total + source.content.length, 0) > MAX_TOTAL_MATERIAL_CHARS) {
    context.addIssue({ code: 'custom', message: `Materials must contain at most ${MAX_TOTAL_MATERIAL_CHARS} characters in total.` });
  }
});
