import { apiError, assertSameOrigin, json } from '@/lib/http';
import { extractMaterial, readMaterialFile } from '@/lib/material-upload';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const material = await extractMaterial(await readMaterialFile(request));
    return json({ material });
  } catch (error) { return apiError(error); }
}
