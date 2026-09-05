import { publicRun } from '@/lib/agent';
import { readUiRun } from '@/lib/ui-live-test';
import { apiError, json, readBody } from '@/lib/http';
import { validRunId } from '@/lib/store';
import { assertManagementOrigin, canManageWorkshop, deleteWorkshop, deleteWorkshopSchema, renameWorkshop, renameWorkshopSchema, withManagementCookie } from '@/lib/workshop-management';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!validRunId(id)) return json({ error: 'Run not found.' }, 404);
    const run = await readUiRun(id);
    return run ? json({ run: publicRun(run), canManage: await canManageWorkshop(request, run) }) : json({ error: 'Run not found.' }, 404);
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertManagementOrigin(request);
    const { id } = await params;
    const input = renameWorkshopSchema.parse(await readBody(request, 2_000));
    const { run, token } = await renameWorkshop(request, id, input);
    return withManagementCookie(json({ run: publicRun(run), canManage: true }), request, token);
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertManagementOrigin(request);
    const { id } = await params;
    const { version } = deleteWorkshopSchema.parse(await readBody(request, 2_000));
    await deleteWorkshop(request, id, version);
    return json({ deleted: true });
  } catch (error) { return apiError(error); }
}
