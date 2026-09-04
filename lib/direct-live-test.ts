import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createGoogle } from '@ai-sdk/google';
import { APICallError, type LanguageModelV4, type LanguageModelV4CallOptions } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';

const MODEL = 'gemini-3.8-flash';
const PROVIDER = 'google.generative-ai';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_CALLS = 10;
const MAX_BYTES = 32_000;
const MAX_OUTPUT = 6000;
type Diagnostic = { message: string; status?: string; code?: number; statusCode?: number; requestId?: string; messageRedacted?: true; messageOmitted?: true };
type Call = {
  number: number; status: 'pending' | 'succeeded' | 'failed'; reservedAt: string; finishedAt?: string;
  requestBytes: number; maxOutputTokens: number; errorCode?: string; diagnostic?: Diagnostic;
  usage?: Record<string, number>; googleUsage?: Record<string, number>; responseId?: string; modelVersion?: string;
  estimatedCostUSD?: number;
};
type Session = {
  runId: string; model: string; provider: string; status: 'active' | 'completed' | 'failed';
  createdAt: string; stoppedAt?: string; errorCode?: string; calls: Call[]; estimatedCostUSD: number;
};
export class DirectLiveTestError extends Error {
  constructor(public readonly code: string) {
    super(`Bounded direct Google test stopped: ${code}.`);
    this.name = 'DirectLiveTestError';
  }
}
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9._/-]{1,160}$/.test(value);
function validateRunId(runId: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId)) throw new DirectLiveTestError('invalid_run_id');
}
function transaction<T>(directory: string, action: (file: string) => T): T {
  const lockPath = path.join(directory, 'session.lock');
  let lock: number | undefined;
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { lock = openSync(lockPath, 'wx', 0o600); } catch { throw new DirectLiveTestError('ledger_locked'); }
    return action(path.join(directory, 'session.json'));
  } catch (error) {
    if (error instanceof DirectLiveTestError) throw error;
    throw new DirectLiveTestError('ledger_unavailable');
  } finally {
    if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); }
  }
}
function readSession(file: string, runId: string): Session {
  if (!existsSync(file)) throw new DirectLiveTestError('allowance_not_initialized');
  const session = JSON.parse(readFileSync(file, 'utf8')) as Session;
  if (session.model !== MODEL || session.provider !== PROVIDER || !Array.isArray(session.calls)
    || !['active', 'completed', 'failed'].includes(session.status)) throw new DirectLiveTestError('invalid_ledger');
  if (session.runId !== runId) throw new DirectLiveTestError('one_run_already_claimed');
  return session;
}
function active(session: Session) {
  if (session.status !== 'active') throw new DirectLiveTestError('session_sealed');
  if (session.calls.some(call => call.status !== 'succeeded')) throw new DirectLiveTestError('pending_or_failed_call');
  if (session.calls.length >= MAX_CALLS) throw new DirectLiveTestError('call_limit');
}
function saveSession(file: string, session: Session) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(session, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(temporary, file);
}
export function createDirectLiveAllowance(runId: string, evidenceDir: string): void {
  validateRunId(runId);
  transaction(evidenceDir, file => {
    if (existsSync(file)) throw new DirectLiveTestError('allowance_already_exists');
    const session: Session = { runId, model: MODEL, provider: PROVIDER, status: 'active', createdAt: new Date().toISOString(), calls: [], estimatedCostUSD: 0 };
    writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  });
}
function diagnostic(error: unknown, params: LanguageModelV4CallOptions, apiKey: string): Diagnostic {
  const omitted = (reason: string): Diagnostic => ({ message: `Provider message omitted: ${reason}.`, messageOmitted: true });
  if (!APICallError.isInstance(error)) return omitted('unrecognized error shape');
  const detail = record(record(error.data).error);
  const result: Diagnostic = { message: '' };
  if (count(error.statusCode) && error.statusCode <= 599) result.statusCode = error.statusCode;
  if (count(detail.code) && detail.code <= 999999) result.code = detail.code;
  if (typeof detail.status === 'string' && /^[A-Z_]{1,64}$/.test(detail.status) && !detail.status.includes(apiKey)) result.status = detail.status;
  const requestId = error.responseHeaders?.['x-request-id'] ?? error.responseHeaders?.['x-goog-request-id'];
  if (identifier(requestId) && !requestId.includes(apiKey)) result.requestId = requestId;
  const original = typeof detail.message === 'string' ? detail.message : error.message;
  if (original.length > 4000 || /[{}]|\b(?:prompt|messages|request[_ ]?body|requestBodyValues)\s*[:=]/i.test(original)) return { ...result, ...omitted('oversized text or embedded request data') };
  let message = original.split(apiKey).join('[redacted credential]');
  const privateText: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === 'string' && value.length >= 8) privateText.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(params.prompt.map(item => item.content));
  for (const text of privateText) {
    message = message.split(text).join('[redacted request content]');
    const words = text.split(/\s+/);
    for (let i = 0; i + 2 < words.length; i++) {
      const fragment = words.slice(i, i + 3).join(' ');
      if (fragment.length >= 16 && message.toLowerCase().includes(fragment.toLowerCase())) return { ...result, ...omitted('reflected request content') };
    }
  }
  message = message
    .replace(/\b(?:Bearer|Basic)\s+[a-zA-Z0-9._~+/-]+=*/gi, '[redacted credential]')
    .replace(/\b(?:api[_ -]?key|token|secret|password|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[redacted credential]')
    .replace(/\b(?:sk[-_]|vck_|vc[pst]_)[a-zA-Z0-9_-]+|\bAIza[a-zA-Z0-9_-]{20,}|\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[redacted credential]')
    .replace(/https?:\/\/[^\s<>"']+|\b[^\s@]+@[^\s@]+\.[^\s@]+/gi, '[redacted address]')
    .replace(/[a-zA-Z0-9_-]{24,}/g, '[redacted identifier]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ');
  result.message = message.length > 600 ? `${message.slice(0, 600)} [truncated]` : message;
  if (result.message !== original) result.messageRedacted = true;
  return result;
}
function boundedOptions(options: LanguageModelV4CallOptions): LanguageModelV4CallOptions {
  if (options.tools?.some(tool => tool.type !== 'function') || options.prompt.some(message => message.role !== 'system' && message.content.some(part => {
    if (part.type === 'text' || part.type === 'reasoning') return false;
    if (part.type === 'tool-call') return part.providerExecuted === true;
    return part.type !== 'tool-result' || !['text', 'json', 'error-text', 'error-json', 'execution-denied'].includes(part.output.type);
  }))) throw new DirectLiveTestError('non_text_or_provider_tool');
  return { ...options, headers: undefined, temperature: undefined, topP: undefined, topK: undefined,
    maxOutputTokens: Number.isInteger(options.maxOutputTokens) && options.maxOutputTokens! > 0 ? Math.min(options.maxOutputTokens!, MAX_OUTPUT) : MAX_OUTPUT,
    reasoning: 'low', providerOptions: { google: { serviceTier: 'standard' } } };
}
export function createBoundedDirectGoogleModel({ runId, evidenceDir, fetch: transport = globalThis.fetch }: {
  runId: string; evidenceDir: string; fetch?: FetchFunction;
}): LanguageModelV4 {
  validateRunId(runId);
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) throw new DirectLiveTestError('direct_key_missing');
  transaction(evidenceDir, file => { active(readSession(file, runId)); });
  return {
    specificationVersion: 'v4', modelId: MODEL, provider: PROVIDER, supportedUrls: {},
    async doGenerate(options) {
      let number: number | undefined;
      let requestBytes = 0;
      let params = options;
      try {
        transaction(evidenceDir, file => { active(readSession(file, runId)); });
        params = boundedOptions(options);
        const model = createGoogle({ apiKey, fetch: async (url, init) => {
          if (number !== undefined) throw new DirectLiveTestError('unexpected_provider_attempt');
          if (String(url) !== URL || init?.method !== 'POST' || typeof init.body !== 'string') throw new DirectLiveTestError('unexpected_request');
          requestBytes = Buffer.byteLength(init.body, 'utf8');
          if (requestBytes > MAX_BYTES) throw new DirectLiveTestError('request_too_large');
          const body = record(JSON.parse(init.body));
          const generation = record(body.generationConfig);
          if (!count(generation.maxOutputTokens) || generation.maxOutputTokens < 1 || generation.maxOutputTokens > MAX_OUTPUT
            || record(generation.thinkingConfig).thinkingLevel !== 'low' || record(generation.thinkingConfig).thinkingBudget !== undefined
            || (generation.candidateCount !== undefined && generation.candidateCount !== 1)
            || body.serviceTier !== 'standard' || body.cachedContent !== undefined
            || (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.some(tool => Object.keys(record(tool)).some(key => key !== 'functionDeclarations'))))) {
            throw new DirectLiveTestError('request_outside_bound');
          }
          number = transaction(evidenceDir, file => {
            const session = readSession(file, runId); active(session);
            const call: Call = { number: session.calls.length + 1, status: 'pending', reservedAt: new Date().toISOString(), requestBytes, maxOutputTokens: generation.maxOutputTokens as number };
            session.calls.push(call); saveSession(file, session); return call.number;
          });
          return transport(url, { ...init, redirect: 'error' });
        } })(MODEL);
        const result = await model.doGenerate(params);
        if (number === undefined) throw new DirectLiveTestError('missing_request');
        const raw = record(result.response?.body);
        const actual = record(raw.usageMetadata);
        const input = result.usage.inputTokens.total;
        const output = result.usage.outputTokens.total;
        const candidates = actual.candidatesTokenCount ?? 0;
        const thoughts = actual.thoughtsTokenCount ?? 0;
        const invalidUsage = !count(input) || !count(output) || !count(actual.promptTokenCount) || !count(actual.totalTokenCount)
          || !count(candidates) || !count(thoughts) || actual.promptTokenCount !== input || candidates + thoughts !== output
          || actual.totalTokenCount !== input + output || (actual.toolUsePromptTokenCount !== undefined && actual.toolUsePromptTokenCount !== 0)
          || input > requestBytes + 8000 + (number - 1) * MAX_OUTPUT || output > params.maxOutputTokens!;
        const failure = invalidUsage ? 'usage_outside_bound' : raw.modelVersion !== MODEL ? 'reported_model_mismatch'
          : actual.serviceTier !== undefined && !['standard', 'STANDARD'].includes(String(actual.serviceTier)) ? 'reported_tier_mismatch' : undefined;
        const usage: Record<string, number> = {};
        for (const [prefix, values] of [['input', result.usage.inputTokens], ['output', result.usage.outputTokens]] as const) {
          for (const [key, value] of Object.entries(values)) if (count(value)) usage[`${prefix}_${key}`] = value;
        }
        const googleUsage: Record<string, number> = {};
        for (const key of ['promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount', 'totalTokenCount', 'cachedContentTokenCount', 'toolUsePromptTokenCount']) if (count(actual[key])) googleUsage[key] = actual[key];
        const estimatedCostUSD = count(input) && count(output) ? (input * 0.75 + output * 3.75) / 1_000_000 : undefined;
        transaction(evidenceDir, file => {
          const session = readSession(file, runId);
          if (session.status !== 'active') throw new DirectLiveTestError('session_sealed');
          Object.assign(session.calls[number! - 1], { status: failure ? 'failed' : 'succeeded', errorCode: failure, finishedAt: new Date().toISOString(), usage, googleUsage,
            modelVersion: identifier(raw.modelVersion) && !raw.modelVersion.includes(apiKey) ? raw.modelVersion : undefined,
            responseId: identifier(result.response?.id) && !result.response!.id!.includes(apiKey) ? result.response!.id : undefined, estimatedCostUSD });
          if (failure) { session.status = 'failed'; session.errorCode = failure; session.stoppedAt = new Date().toISOString(); }
          session.estimatedCostUSD = session.calls.reduce((sum, call) => sum + (call.estimatedCostUSD ?? 0), 0);
          saveSession(file, session);
        });
        if (failure) throw new DirectLiveTestError(failure);
        return result;
      } catch (error) {
        const errorCode = error instanceof DirectLiveTestError ? error.code : 'provider_failed';
        const safeDiagnostic = error instanceof DirectLiveTestError ? undefined : diagnostic(error, params, apiKey);
        transaction(evidenceDir, file => {
          const session = readSession(file, runId);
          if (session.status === 'active') { session.status = 'failed'; session.errorCode = errorCode; session.stoppedAt = new Date().toISOString(); }
          if (number !== undefined) Object.assign(session.calls[number - 1], { status: 'failed', errorCode, diagnostic: safeDiagnostic, finishedAt: new Date().toISOString() });
          saveSession(file, session);
        });
        throw new DirectLiveTestError(errorCode);
      }
    },
    async doStream() { sealDirectLiveTest(runId, 'failed', evidenceDir); throw new DirectLiveTestError('streaming_not_allowed'); },
  };
}
export function sealDirectLiveTest(runId: string, status: 'completed' | 'failed', evidenceDir: string): void {
  validateRunId(runId);
  transaction(evidenceDir, file => {
    const session = readSession(file, runId);
    if (session.status !== 'active') return;
    session.status = status === 'completed' && session.calls.length > 0 && session.calls.every(call => call.status === 'succeeded') ? 'completed' : 'failed';
    session.stoppedAt = new Date().toISOString(); saveSession(file, session);
  });
}
