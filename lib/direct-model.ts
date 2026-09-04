import { createGoogle } from '@ai-sdk/google';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { getConfig, LIVE_MODEL } from './config';

export function createDirectGoogleModel({ fetch }: { fetch?: FetchFunction } = {}): LanguageModelV4 {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) throw new Error('Direct Google mode requires GOOGLE_GENERATIVE_AI_API_KEY in this project.');
  const config = getConfig();
  if (config.mode !== 'live' || !config.ready) throw new Error('Direct Google runs require a valid local live configuration.');
  return createGoogle({ apiKey, fetch })(LIVE_MODEL);
}
