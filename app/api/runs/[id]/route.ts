import { publicRun } from '@/lib/agent';
import { readUiRun } from '@/lib/ui-live-test';
import { apiError, json } from '@/lib/http';
import { validRunId } from '@/lib/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!validRunId(id)) return json({ error: 'Run not found.' }, 404);
    const run = await readUiRun(id);
    return run ? json({ run: publicRun(run) }) : json({ error: 'Run not found.' }, 404);
  } catch (error) { return apiError(error); }
}
