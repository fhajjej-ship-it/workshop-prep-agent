import { z } from 'zod';
import { publicRun } from '@/lib/agent';
import { createUiRun, getUiConfig } from '@/lib/ui-live-test';
import { apiError, json, readBody } from '@/lib/http';
import { briefSchema } from '@/lib/validation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const config = getUiConfig();
    if (!config.ready) return json({ error: config.blockers.join(' ') }, 503);
    const { brief } = z.object({ brief: briefSchema }).strict().parse(await readBody(request));
    return json({ run: publicRun(await createUiRun(brief)) }, 201);
  } catch (error) { return apiError(error); }
}
