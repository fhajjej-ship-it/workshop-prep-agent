import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { APICallError, type LanguageModelV4, type LanguageModelV4CallOptions, type LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { GatewayError } from '@ai-sdk/gateway';

// Historical Gateway guard only. The active direct Google path uses direct-model.ts.
// Keep these IDs independent from current configuration so sealed ledgers stay readable.
const MODEL = 'zai/glm-5.3-promo-50';
const LIVE_PROVIDER = 'digitalocean';

export const LIVE_TEST_MAX_CALLS = 10;
export const LIVE_TEST_MAX_OUTPUT_TOKENS = 6000;
const MAX_REQUEST_BYTES = 32_000;
const defaultDirectory = () => path.join(process.cwd(), '.local/live-test');

export class LiveTestGuardError extends Error {
  constructor(public readonly code: string, public readonly statusCode?: number) {
    super(`Bounded live test stopped: ${code}.`);
    this.name = 'LiveTestGuardError';
  }
}

type ProviderDiagnostic = {
  type?: string; code?: string | number; message: string; messageRedacted?: true; messageOmitted?: true;
  generationId?: string; requestId?: string;
};
type Call = {
  number: number; status: 'pending' | 'succeeded' | 'failed'; reservedAt: string;
  finishedAt?: string; requestBytes: number; maxOutputTokens: number;
  usage?: Record<string, number>; gateway?: Record<string, unknown>;
  errorCode?: string; statusCode?: number; providerDiagnostic?: ProviderDiagnostic;
};
type Session = {
  runId: string; model: string; status: 'active' | 'completed' | 'failed';
  createdAt: string; calls: Call[]; stoppedAt?: string; errorCode?: string;
};

// The short file lock protects reservation across processes. It is released before
// inference; a persisted pending call prevents any duplicate or resumed request.
function transaction<T>(directory: string, action: (file: string) => T): T {
  let lock: number | undefined;
  const lockPath = path.join(directory, 'session.lock');
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { lock = openSync(lockPath, 'wx', 0o600); }
    catch { throw new LiveTestGuardError('ledger_locked'); }
    return action(path.join(directory, 'session.json'));
  } catch (error) {
    if (error instanceof LiveTestGuardError) throw error;
    throw new LiveTestGuardError('ledger_unavailable');
  } finally {
    if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); }
  }
}

function readSession(file: string): Session {
  const session = JSON.parse(readFileSync(file, 'utf8')) as Session;
  if (!session || session.model !== MODEL || !Array.isArray(session.calls)
    || !['active', 'completed', 'failed'].includes(session.status)) {
    throw new LiveTestGuardError('invalid_ledger');
  }
  return session;
}

function saveSession(file: string, session: Session) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(session, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(temporary, file);
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9._:/-]{1,160}$/.test(value);

function safeEvidence(result: LanguageModelV4GenerateResult) {
  const usage: Record<string, number> = {};
  for (const [prefix, values] of [['input', result.usage.inputTokens], ['output', result.usage.outputTokens]] as const) {
    for (const [key, value] of Object.entries(values)) if (count(value)) usage[`${prefix}_${key}`] = value;
  }
  const metadata = record(result.providerMetadata?.gateway);
  const gateway: Record<string, unknown> = {};
  for (const key of ['cost', 'marketCost']) {
    const value = metadata[key];
    if (typeof value === 'string' && /^\d{1,8}(\.\d{1,16})?$/.test(value)) gateway[key] = value;
  }
  if (identifier(metadata.generationId)) gateway.generationId = metadata.generationId;
  const routing = record(metadata.routing);
  const safeRouting: Record<string, unknown> = {};
  for (const key of ['originalModelId', 'canonicalSlug', 'resolvedProvider', 'resolvedProviderApiModelId', 'finalProvider']) {
    if (identifier(routing[key])) safeRouting[key] = routing[key];
  }
  for (const key of ['modelAttemptCount', 'totalProviderAttemptCount']) {
    if (count(routing[key])) safeRouting[key] = routing[key];
  }
  gateway.routing = safeRouting;
  return { usage, gateway };
}

function safeStatus(error: unknown): number | undefined {
  const status = record(error).statusCode;
  return Number.isInteger(status) && (status as number) >= 100 && (status as number) <= 599 ? status as number : undefined;
}

function safeProviderDiagnostic(error: unknown, options: LanguageModelV4CallOptions): ProviderDiagnostic {
  const omitted = (reason: string): ProviderDiagnostic => ({ message: `Provider message omitted: ${reason}.`, messageOmitted: true });
  if (!GatewayError.isInstance(error) && !APICallError.isInstance(error)) return omitted('unrecognized error shape');
  const apiError = APICallError.isInstance(error) ? error : APICallError.isInstance(error.cause) ? error.cause : undefined;
  const body = record(apiError?.data);
  const detail = record(body.error);
  // Inspect only recognized fields. Never copy the SDK cause, request, response body, or headers.
  const diagnostic: ProviderDiagnostic = { message: '' };
  const key = process.env.AI_GATEWAY_API_KEY;
  const privateText: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === 'string' && value.length >= 8) privateText.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect(options.prompt.map(message => message.content));
  const safeId = (value: unknown, pattern: RegExp) => typeof value === 'string' && pattern.test(value)
    && (!key || !value.includes(key)) && !privateText.some(text => text.includes(value)) ? value : undefined;
  if (GatewayError.isInstance(error)) {
    diagnostic.type = safeId(error.type, /^[a-z_]{1,48}$/);
    diagnostic.generationId = safeId(error.generationId, /^gen_[0-9A-HJKMNP-TV-Z]{26}$/);
  }
  const errorCode = detail.code ?? record(error).code;
  if (Number.isSafeInteger(errorCode) && (errorCode as number) >= 0 && (errorCode as number) <= 999999) diagnostic.code = errorCode as number;
  else diagnostic.code = safeId(errorCode, /^[a-zA-Z][a-zA-Z_]{1,63}$/);
  diagnostic.requestId = safeId(body.requestId ?? apiError?.responseHeaders?.['x-request-id'], /^(?:req_[a-zA-Z0-9_-]{8,80}|[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12})$/);
  const original = typeof detail.message === 'string' ? detail.message : error.message;
  if (original.length > 4000 || /[{}]|\b(?:prompt|messages|request[_ ]?body|requestBodyValues)\s*[:=]/i.test(original)) {
    return { ...diagnostic, ...omitted('oversized text or embedded request data') };
  }
  let message = original;
  if (key) message = message.split(key).join('[redacted credential]');
  for (const text of privateText) {
    message = message.split(text).join('[redacted request content]');
    // Partial prompt echoes cannot be safely separated from the surrounding private content.
    const words = text.split(/\s+/);
    for (let i = 0; i + 2 < words.length; i++) {
      const fragment = words.slice(i, i + 3).join(' ');
      if (fragment.length >= 16 && message.toLowerCase().includes(fragment.toLowerCase())) {
        return { ...diagnostic, ...omitted('reflected request content') };
      }
    }
  }
  message = message
    .replace(/\b(?:Bearer|Basic)\s+[a-zA-Z0-9._~+/-]+=*/gi, '[redacted credential]')
    .replace(/\b(?:api[_ -]?key|token|secret|password|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[redacted credential]')
    .replace(/\b(?:sk[-_]|vck_|vc[pst]_)[a-zA-Z0-9_-]+|\bAIza[a-zA-Z0-9_-]{20,}|\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[redacted credential]')
    .replace(/https?:\/\/[^\s<>"']+|\b[^\s@]+@[^\s@]+\.[^\s@]+/gi, '[redacted address]')
    .replace(/[a-zA-Z0-9_-]{24,}/g, '[redacted identifier]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ');
  diagnostic.message = message.length > 600 ? `${message.slice(0, 600)} [truncated]` : message;
  if (diagnostic.message !== original) diagnostic.messageRedacted = true;
  return diagnostic;
}

function boundedOptions(options: LanguageModelV4CallOptions): LanguageModelV4CallOptions {
  return {
    ...options,
    maxOutputTokens: Number.isInteger(options.maxOutputTokens) && options.maxOutputTokens! > 0
      ? Math.min(options.maxOutputTokens!, LIVE_TEST_MAX_OUTPUT_TOKENS) : LIVE_TEST_MAX_OUTPUT_TOKENS,
    reasoning: 'low',
    // This test deliberately has no paid provider tools, service tiers, BYOK,
    // regional routing or overlapping provider-specific reasoning settings.
    providerOptions: { gateway: { only: [LIVE_PROVIDER], models: [] } },
  };
}

function hasNonTextContent(options: LanguageModelV4CallOptions): boolean {
  return options.prompt.some(message => message.role !== 'system' && message.content.some(part => {
    if (part.type === 'text' || part.type === 'reasoning') return false;
    if (part.type === 'tool-call') return part.providerExecuted === true;
    if (part.type !== 'tool-result') return true;
    return !['text', 'json', 'error-text', 'error-json', 'execution-denied'].includes(part.output.type);
  }));
}

export function createBoundedLiveModel({ runId, model, evidenceDir = defaultDirectory() }: {
  runId: string; model: LanguageModelV4; evidenceDir?: string;
}): LanguageModelV4 {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId)) throw new LiveTestGuardError('invalid_run_id');
  if (model.modelId !== MODEL) throw new LiveTestGuardError('model_mismatch');
  return {
    specificationVersion: 'v4', provider: model.provider, modelId: model.modelId, supportedUrls: model.supportedUrls,
    async doGenerate(options) {
      const params = boundedOptions(options);
      const number = transaction(evidenceDir, file => {
        if (!existsSync(file)) {
          const initial: Session = { runId, model: MODEL, status: 'active', createdAt: new Date().toISOString(), calls: [] };
          writeFileSync(file, `${JSON.stringify(initial, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        }
        const session = readSession(file);
        if (session.runId !== runId) throw new LiveTestGuardError('one_run_already_claimed');
        if (session.status !== 'active') throw new LiveTestGuardError('session_sealed');
        if (session.calls.some(call => call.status !== 'succeeded')) throw new LiveTestGuardError('pending_or_failed_call');
        let requestBytes: number;
        try { requestBytes = Buffer.byteLength(JSON.stringify(params), 'utf8'); }
        catch {
          session.status = 'failed'; session.errorCode = 'unserializable_request';
          saveSession(file, session);
          throw new LiveTestGuardError('unserializable_request');
        }
        const blocked = session.calls.length >= LIVE_TEST_MAX_CALLS ? 'call_limit'
          : requestBytes > MAX_REQUEST_BYTES ? 'request_too_large'
          : params.tools?.some(tool => tool.type !== 'function') ? 'provider_tool_not_allowed'
          : hasNonTextContent(params) ? 'non_text_input_not_allowed'
          : undefined;
        if (blocked) {
          session.status = 'failed'; session.errorCode = blocked; session.stoppedAt = new Date().toISOString();
          saveSession(file, session);
          throw new LiveTestGuardError(blocked);
        }
        const call: Call = {
          number: session.calls.length + 1, status: 'pending', reservedAt: new Date().toISOString(),
          requestBytes, maxOutputTokens: params.maxOutputTokens!,
        };
        session.calls.push(call);
        saveSession(file, session);
        return call.number;
      });
      try {
        const result = await model.doGenerate(params);
        const evidence = safeEvidence(result);
        const routing = record(evidence.gateway.routing);
        const mismatch = (routing.canonicalSlug !== undefined && routing.canonicalSlug !== MODEL)
          || (routing.resolvedProvider !== undefined && routing.resolvedProvider !== LIVE_PROVIDER)
          || (routing.finalProvider !== undefined && routing.finalProvider !== LIVE_PROVIDER);
        const input = result.usage.inputTokens.total;
        const output = result.usage.outputTokens.total;
        const requestBytes = Buffer.byteLength(JSON.stringify(params), 'utf8');
        const invalidUsage = !count(input) || !count(output)
          || input > requestBytes + 8000 + (number - 1) * LIVE_TEST_MAX_OUTPUT_TOKENS
          || output > params.maxOutputTokens!;
        const failure = mismatch ? 'reported_model_mismatch' : invalidUsage ? 'usage_outside_bound'
          : typeof routing.totalProviderAttemptCount === 'number' && routing.totalProviderAttemptCount !== 1 ? 'unexpected_provider_attempts' : undefined;
        transaction(evidenceDir, file => {
          const session = readSession(file);
          const call = session.calls[number - 1];
          Object.assign(call, evidence, { status: failure ? 'failed' : 'succeeded', finishedAt: new Date().toISOString() });
          if (failure) { session.status = 'failed'; call.errorCode = failure; }
          saveSession(file, session);
        });
        if (failure) throw new LiveTestGuardError(failure);
        return result;
      } catch (error) {
        const errorCode = error instanceof LiveTestGuardError ? error.code : 'provider_failed';
        const statusCode = safeStatus(error);
        const providerDiagnostic = error instanceof LiveTestGuardError ? undefined : safeProviderDiagnostic(error, params);
        transaction(evidenceDir, file => {
          const session = readSession(file);
          session.status = 'failed'; session.errorCode = errorCode; session.stoppedAt = new Date().toISOString();
          Object.assign(session.calls[number - 1], { status: 'failed', errorCode, statusCode, providerDiagnostic, finishedAt: new Date().toISOString() });
          saveSession(file, session);
        });
        throw new LiveTestGuardError(errorCode, statusCode);
      }
    },
    async doStream() { throw new LiveTestGuardError('streaming_not_allowed'); },
  };
}

export function sealBoundedLiveTest(runId: string, status: 'completed' | 'failed', evidenceDir = defaultDirectory()): void {
  transaction(evidenceDir, file => {
    if (!existsSync(file)) return;
    const session = readSession(file);
    if (session.runId !== runId) return;
    if (session.status !== 'active') return;
    session.status = status === 'completed' && session.calls.every(call => call.status === 'succeeded') ? 'completed' : 'failed';
    session.stoppedAt = new Date().toISOString();
    saveSession(file, session);
  });
}
