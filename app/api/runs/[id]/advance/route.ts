import { z } from 'zod';
import { clarificationAnswerSchema, formatSchema, publicRun } from '@/lib/agent';
import { advanceUiRun } from '@/lib/ui-live-test';
import { apiError, json, readBody } from '@/lib/http';
import { validRunId } from '@/lib/store';
export const runtime = 'nodejs';
export const maxDuration = 240;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!validRunId(id)) return json({ error: 'Run not found.' }, 404);
    const { format, answer } = z.object({ format: formatSchema.optional(), answer: clarificationAnswerSchema.optional() }).strict()
      .refine(input => input.format === undefined || input.answer === undefined, 'Provide only the answer this run requested.').parse(await readBody(request));
    const run = await advanceUiRun(id, format, undefined, answer);
    return run ? json({ run: publicRun(run) }) : json({ error: 'Run not found.' }, 404);
  } catch (error) { return apiError(error); }
}
