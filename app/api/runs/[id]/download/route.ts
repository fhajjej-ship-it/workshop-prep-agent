import { publicRun } from '@/lib/agent';
import { readUiRun } from '@/lib/ui-live-test';
import { packMarkdown, packProvenance } from '@/lib/download';
import { packPdf } from '@/lib/download-pdf';
import { packDocx } from '@/lib/download-docx';
import { hasCurrentContentReview } from '@/lib/content-review';
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
    if (run.workflowVersion === 2 && !hasCurrentContentReview(run)) return json({ error: 'This draft needs a passing content review before downloading.' }, 409);
    const format = new URL(request.url).searchParams.get('format') ?? 'md';
    if (!['pdf', 'docx', 'md', 'json'].includes(format)) return json({ error: 'Choose pdf, docx, md or json.' }, 400);
    const content = format === 'pdf' ? new Uint8Array(await packPdf(run)) : format === 'docx' ? new Uint8Array(await packDocx(run))
      : format === 'md' ? packMarkdown(run) : JSON.stringify({ provenance: packProvenance(run), ...publicRun(run) }, null, 2);
    const contentType = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', md: 'text/markdown; charset=utf-8', json: 'application/json; charset=utf-8' }[format];
    return new Response(content, {
      headers: {
        'Content-Type': contentType!,
        'Content-Disposition': `attachment; filename="workshop-${id}.${format}"`,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) { return apiError(error); }
}
