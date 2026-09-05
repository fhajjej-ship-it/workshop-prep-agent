import { z } from 'zod';
import { publicRun } from '@/lib/agent';
import { createUiRun, getUiConfig } from '@/lib/ui-live-test';
import { apiError, json, readBody } from '@/lib/http';
import { briefSchema } from '@/lib/validation';
import { materialsSchema } from '@/lib/material-input';
import { managementIdentity, withManagementCookie } from '@/lib/workshop-management';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const config = getUiConfig();
    if (!config.ready) return json({ error: config.blockers.join(' ') }, 503);
    const { brief, materials } = z.object({ brief: briefSchema, materials: materialsSchema.optional() }).strict().parse(await readBody(request, 250_000));
    const identity = managementIdentity(request);
    const run = await createUiRun(brief, materials, identity.hash);
    return withManagementCookie(json({ run: publicRun(run) }, 201), request, identity.token);
  } catch (error) { return apiError(error); }
}
