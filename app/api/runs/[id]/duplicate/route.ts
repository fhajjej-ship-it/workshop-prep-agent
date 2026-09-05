import { publicRun } from '@/lib/agent';
import { apiError, json, readBody } from '@/lib/http';
import { validRunId } from '@/lib/store';
import { duplicateWorkshop, duplicateWorkshopSchema } from '@/lib/workshop-duplicate';
import { assertManagementOrigin, withManagementCookie } from '@/lib/workshop-management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertManagementOrigin(request);
    const { id } = await params;
    if (!validRunId(id)) return json({ error: 'Workshop not found.' }, 404);
    const input = duplicateWorkshopSchema.parse(await readBody(request, 2_000));
    const { run, token } = await duplicateWorkshop(request, id, input);
    return withManagementCookie(json({ run: publicRun(run), canManage: true }, 201), request, token);
  } catch (error) { return apiError(error); }
}
