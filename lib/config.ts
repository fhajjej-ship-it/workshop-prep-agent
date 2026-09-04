import type { AppConfig } from './types';

// Verified against Google's direct Gemini API documentation on 2026-09-04.
export const LIVE_MODEL = 'gemini-3.8-flash';
export const LIVE_PROVIDER = 'google.generative-ai';
// Retained for historical one-use launchers, whose preflight must stay closed.
export const DIRECT_TEST_BLOCKER = 'Direct Google live testing requires verified cost bounds and separate approval.';

export function getConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const mode = env.WORKSHOP_MODE === 'live' ? 'live' : 'test';
  const storage = env.WORKSHOP_STORE === 'postgres' ? 'postgres' : 'local';
  const blockers: string[] = [];
  if (env.WORKSHOP_MODE && !['test', 'live'].includes(env.WORKSHOP_MODE)) blockers.push('WORKSHOP_MODE must be test or live.');
  if (env.WORKSHOP_STORE && !['local', 'postgres'].includes(env.WORKSHOP_STORE)) blockers.push('WORKSHOP_STORE must be local or postgres.');
  if (mode === 'live' && !env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) blockers.push('Live mode requires GOOGLE_GENERATIVE_AI_API_KEY in this project.');
  if (mode === 'live' && env.VERCEL) blockers.push('Live model runs are enabled only on this local server.');
  if (mode === 'live' && env.WORKSHOP_MODEL && env.WORKSHOP_MODEL !== LIVE_MODEL) blockers.push(`This prototype supports only ${LIVE_MODEL}.`);
  if (storage === 'postgres' && !env.DATABASE_URL) blockers.push('Postgres storage requires DATABASE_URL and the separately applied db/schema.sql.');
  if (env.VERCEL && storage === 'local') blockers.push('Local file storage is not durable on Vercel. Configure Postgres before hosting.');
  return { mode, model: mode === 'live' ? LIVE_MODEL : null, storage, ready: blockers.length === 0, blockers };
}
