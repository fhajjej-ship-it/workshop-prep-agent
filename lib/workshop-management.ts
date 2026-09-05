import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { RequestError } from './http';
import { isArchivedUiRun, mutableUiRun } from './ui-live-test';
import type { Run } from './types';

export const managementCookieName = 'workshop-management';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostedMarkers = ['VERCEL', 'RENDER', 'RENDER_SERVICE_ID', 'NETLIFY', 'CF_PAGES', 'AWS_LAMBDA_FUNCTION_NAME', 'FLY_APP_NAME', 'K_SERVICE'];

export const workshopVersionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const renameWorkshopSchema = z.object({
  displayName: z.string().trim().min(1).max(180).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Use a name without control characters.'),
  version: workshopVersionSchema,
}).strict();
export const deleteWorkshopSchema = z.object({ version: workshopVersionSchema }).strict();

function requestTarget(request: Request): URL {
  const target = new URL(request.url);
  const host = request.headers.get('host');
  if (host) {
    const browserTarget = new URL(`${target.protocol}//${host}`);
    if (browserTarget.host !== host || browserTarget.username || browserTarget.password) throw new RequestError('Invalid request target.', 403);
    return browserTarget;
  }
  return target;
}

export function assertManagementOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  let originUrl: URL;
  try { originUrl = new URL(origin ?? ''); }
  catch { throw new RequestError('A same-origin request is required to manage workshops.', 403); }
  if (!['http:', 'https:'].includes(originUrl.protocol) || origin !== originUrl.origin || originUrl.origin !== requestTarget(request).origin) {
    throw new RequestError('A same-origin request is required to manage workshops.', 403);
  }
}

export function localLegacyManagement(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== 'development' || hostedMarkers.some(key => Boolean(env[key]))) return false;
  try {
    return loopbackHosts.has(new URL(request.url).hostname) && loopbackHosts.has(requestTarget(request).hostname);
  } catch { return false; }
}

function managementToken(request: Request): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${managementCookieName}=`)).map(value => value.slice(managementCookieName.length + 1));
  return values.length === 1 && tokenPattern.test(values[0]) ? values[0] : null;
}

export function managementIdentity(request: Request): { token: string; hash: string } {
  const token = managementToken(request) ?? randomBytes(32).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

export function withManagementCookie<T extends Response>(response: T, request: Request, token: string): T {
  if (managementToken(request) === token) return response;
  const secure = new URL(request.url).protocol === 'https:' || process.env.NODE_ENV === 'production' || hostedMarkers.some(key => Boolean(process.env[key]));
  response.headers.append('Set-Cookie', `${managementCookieName}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
  return response;
}

export function bootstrapManagementCookie<T extends Response>(response: T, request: Request): T {
  // Cross-site reads must not replace an existing browser's management identity.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return response;
  if (request.headers.has('origin')) {
    try { assertManagementOrigin(request); } catch { return response; }
  }
  return withManagementCookie(response, request, managementIdentity(request).token);
}

export function ownsWorkshop(request: Request, run: Run, env: Record<string, string | undefined> = process.env): boolean {
  if (run.managementHash === undefined) return localLegacyManagement(request, env);
  const token = managementToken(request);
  if (!token || !hashPattern.test(run.managementHash)) return false;
  const actual = createHash('sha256').update(token).digest();
  return timingSafeEqual(actual, Buffer.from(run.managementHash, 'hex'));
}

export async function canManageWorkshop(request: Request, run: Run): Promise<boolean> {
  return ownsWorkshop(request, run) && !await isArchivedUiRun(run.id);
}

async function mutationTarget(request: Request, id: string, version: number) {
  assertManagementOrigin(request);
  const target = await mutableUiRun(id);
  if (!ownsWorkshop(request, target.run)) throw new RequestError('This browser cannot manage this workshop.', 403);
  if (target.run.status === 'running') throw new RequestError('Wait for this preparation to finish before changing or deleting it.', 409);
  if (target.run.version !== version) throw new RequestError('This workshop has changed. Reload before trying again.', 409);
  return target;
}

export async function renameWorkshop(request: Request, id: string, input: z.infer<typeof renameWorkshopSchema>) {
  const { run, store } = await mutationTarget(request, id, input.version);
  const identity = managementIdentity(request);
  run.displayName = input.displayName;
  if (run.managementHash === undefined) run.managementHash = identity.hash;
  await store.save(run);
  return { run, token: identity.token };
}

export async function deleteWorkshop(request: Request, id: string, version: number): Promise<void> {
  const { store } = await mutationTarget(request, id, version);
  await store.delete(id, version);
}
