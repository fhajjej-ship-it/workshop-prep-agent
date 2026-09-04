import { publicRun } from '@/lib/agent';
import { readUiRun } from '@/lib/ui-live-test';
import { packMarkdown } from '@/lib/download';
import { apiError, json } from '@/lib/http';
import { validRunId } from '@/lib/store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!validRunId(id)) return json({ error: 'Run not found.' }, 404);
    const run = await readUiRun(id);
    if (!run) return json({ error: 'Run not found.' }, 404);
    if (run.status !== 'completed' || !run.validation?.valid || !run.pack) return json({ error: 'A validated pack must be saved before downloading.' }, 409);
    const format = new URL(request.url).searchParams.get('format') ?? 'md';
    if (!['md', 'json'].includes(format)) return json({ error: 'Choose md or json.' }, 400);
    return new Response(format === 'md' ? packMarkdown(run) : JSON.stringify({ provenance: { synthetic: true, humanReviewRequired: true, liveModelUsed: run.mode === 'live' }, ...publicRun(run) }, null, 2), {
      headers: {
        'Content-Type': format === 'md' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="workshop-${id}.${format}"`,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) { return apiError(error); }
}
