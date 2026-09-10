import type { AppConfig } from './types';

// Verified against Google's direct Gemini API documentation on 2026-09-04.
export const LIVE_MODEL = 'gemini-3.8-flash';
export const LIVE_PROVIDER = 'google.generative-ai';
// Retained for historical one-use launchers, whose preflight must stay closed.
export const DIRECT_TEST_BLOCKER = 'Direct Google live testing requires verified cost bounds and separate approval.';

export function getStorageConfig(env: Record<string, string | undefined> = process.env) {
  const storage = env.WORKSHOP_STORE === 'postgres' ? 'postgres' : 'local';
  const blockers: string[] = [];
  if (env.WORKSHOP_STORE && !['local', 'postgres'].includes(env.WORKSHOP_STORE)) blockers.push('WORKSHOP_STORE must be local or postgres.');
  if (storage === 'postgres' && !env.DATABASE_URL) blockers.push('Postgres storage requires DATABASE_URL and the separately applied db/schema.sql.');
  if (env.VERCEL && storage === 'local') blockers.push('Local file storage is not durable on Vercel. Configure Postgres before hosting.');
  return { storage, ready: blockers.length === 0, blockers } as const;
}

export function getConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const mode = env.WORKSHOP_MODE === 'live' ? 'live' : 'test';
  const storageConfig = getStorageConfig(env);
  const blockers: string[] = [...storageConfig.blockers];
  const configuredLimit = env.WORKSHOP_DAILY_GENERATION_LIMIT;
  let dailyGenerationLimit: number | undefined;
  if (configuredLimit !== undefined) {
    if (!/^\d+$/.test(configuredLimit) || !Number.isSafeInteger(Number(configuredLimit))) {
      blockers.push('WORKSHOP_DAILY_GENERATION_LIMIT must be a nonnegative whole number.');
    } else dailyGenerationLimit = Number(configuredLimit);
  }
  if (env.WORKSHOP_MODE && !['test', 'live'].includes(env.WORKSHOP_MODE)) blockers.push('WORKSHOP_MODE must be test or live.');
  if (mode === 'live' && !env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) blockers.push('Live mode requires GOOGLE_GENERATIVE_AI_API_KEY in this project.');
  if (mode === 'live' && env.VERCEL && env.WORKSHOP_ALLOW_HOSTED_LIVE !== 'true') blockers.push('Live model runs on Vercel require WORKSHOP_ALLOW_HOSTED_LIVE=true.');
  if (mode === 'live' && env.WORKSHOP_MODEL && env.WORKSHOP_MODEL !== LIVE_MODEL) blockers.push(`This prototype supports only ${LIVE_MODEL}.`);
  return { mode, model: mode === 'live' ? LIVE_MODEL : null, storage: storageConfig.storage, ready: blockers.length === 0, blockers, ...(dailyGenerationLimit !== undefined ? { dailyGenerationLimit } : {}) };
}
