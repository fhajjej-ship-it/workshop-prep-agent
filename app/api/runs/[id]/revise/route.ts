import { z } from 'zod';
import { publicRun, revisionFeedbackSchema } from '@/lib/agent';
import { createUiRevision } from '@/lib/ui-live-test';
import { apiError, json, readBody } from '@/lib/http';
import { validRunId } from '@/lib/store';
import { materialsSchema } from '@/lib/material-input';
import { briefSchema } from '@/lib/validation';
import { managementIdentity, withManagementCookie } from '@/lib/workshop-management';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!validRunId(id)) return json({ error: 'Run not found.' }, 404);
    const { feedback, materials, brief } = z.object({ feedback: revisionFeedbackSchema, materials: materialsSchema.optional(), brief: briefSchema.optional() }).strict().parse(await readBody(request, 250_000));
    const identity = managementIdentity(request);
    const run = await createUiRevision(id, feedback, identity.hash, materials, brief);
    return withManagementCookie(json({ run: publicRun(run) }, 201), request, identity.token);
  } catch (error) { return apiError(error); }
}
