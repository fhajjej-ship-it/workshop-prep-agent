import { exampleWorkshopRun } from '@/lib/example-workshop';
import { packPdf } from '@/lib/download-pdf';
import { packDocx } from '@/lib/download-docx';
import { apiError, json } from '@/lib/http';

export const runtime = 'nodejs';

/** A bundled saved example: reading it never creates or advances a run. */
export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get('format');
  if (format !== 'pdf' && format !== 'docx') return json({ error: 'Choose pdf or docx.' }, 400);
  try {
    const run = { ...exampleWorkshopRun, messages: [] };
    const content = format === 'pdf' ? await packPdf(run) : await packDocx(run);
    return new Response(new Uint8Array(content), {
      headers: {
        'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="example-ai-pilot-workshop.${format}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) { return apiError(error); }
}
