import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { RunConflict } from './store';

export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin) {
    let originUrl: URL;
    try { originUrl = new URL(origin); } catch { throw new RequestError('Invalid request origin.', 403); }
    // Next may normalize request.url to an internal hostname. Host is the browser target.
    const host = request.headers.get('host') ?? new URL(request.url).host;
    if (originUrl.protocol !== new URL(request.url).protocol || originUrl.host !== host) throw new RequestError('Cross-origin requests are not allowed.', 403);
  }
}
export async function readBody(request: Request, maxChars = 16_000): Promise<unknown> {
  assertSameOrigin(request);
  const text = await request.text();
  if (text.length > maxChars) throw new RequestError('Request body is too large.', 413);
  try { return JSON.parse(text || '{}'); } catch { throw new RequestError('Invalid JSON request.', 400); }
}
export class RequestError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) { super(message); }
}
export function apiError(error: unknown) {
  if (error instanceof RequestError) {
    const response = json({ error: error.message }, error.status);
    if (error.retryAfter !== undefined) response.headers.set('Retry-After', String(error.retryAfter));
    return response;
  }
  if (error instanceof RunConflict) return json({ error: error.message }, 409);
  if (error instanceof ZodError) return json({ error: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' ') }, 400);
  return json({ error: 'The request could not be completed. Check the configured run store and local server; no fallback output was substituted.' }, 503);
}
