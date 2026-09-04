import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { APICallError, type LanguageModelV4CallOptions, type LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { GatewayForbiddenError } from '@ai-sdk/gateway';
import { createBoundedLiveModel, LiveTestGuardError, LIVE_TEST_MAX_CALLS, sealBoundedLiveTest } from '../lib/live-test';
// Historical Gateway guard fixtures remain separate from the prepared direct model.
const LIVE_MODEL = 'zai/glm-5.3-promo-50';
const LIVE_PROVIDER = 'digitalocean';

const params: LanguageModelV4CallOptions = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'Synthetic workshop.' }] }] };
const result: LanguageModelV4GenerateResult = {
  content: [{ type: 'text', text: 'Local mock only.' }], finishReason: { unified: 'stop', raw: 'STOP' }, warnings: [],
  usage: { inputTokens: { total: 80, noCache: 80, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 10, reasoning: 10 }, raw: { private: 'do-not-save' } },
  providerMetadata: { gateway: { cost: '0.000135', generationId: 'gen_mock', routing: { canonicalSlug: LIVE_MODEL, resolvedProvider: LIVE_PROVIDER, totalProviderAttemptCount: 1, planningReasoning: 'do-not-save' }, private: 'do-not-save' } },
};
const mock = (doGenerate: (options: LanguageModelV4CallOptions) => Promise<LanguageModelV4GenerateResult> = async () => result) =>
  new MockLanguageModelV4({ modelId: LIVE_MODEL, doGenerate });
async function directory(fn: (evidenceDir: string) => Promise<void>) {
  const evidenceDir = await mkdtemp(path.join(process.cwd(), '.local-test-live-'));
  try { await fn(evidenceDir); } finally { await rm(evidenceDir, { recursive: true, force: true }); }
}
const code = (expected: string) => (error: unknown) => error instanceof LiveTestGuardError && error.code === expected;

test('reserves before inference, enforces settings, persists only safe evidence, and seals one run', async () => {
  await directory(async evidenceDir => {
    const provider = mock(async options => {
      const ledger = JSON.parse(await readFile(path.join(evidenceDir, 'session.json'), 'utf8'));
      assert.equal(ledger.calls[0].status, 'pending');
      assert.equal(options.maxOutputTokens, 6000);
      assert.equal(options.reasoning, 'low');
      assert.deepEqual(options.providerOptions, { gateway: { only: ['digitalocean'], models: [] } });
      return result;
    });
    const model = createBoundedLiveModel({ runId: 'run-a', model: provider, evidenceDir });
    await model.doGenerate({ ...params, maxOutputTokens: 90_000, reasoning: 'high', providerOptions: { gateway: { serviceTier: 'priority', models: ['other/model'] } } });
    const saved = await readFile(path.join(evidenceDir, 'session.json'), 'utf8');
    assert.ok(!saved.includes('do-not-save'));
    assert.equal(JSON.parse(saved).calls[0].usage.output_reasoning, 10);
    assert.equal(JSON.parse(saved).calls[0].gateway.cost, '0.000135');
    assert.equal((await stat(path.join(evidenceDir, 'session.json'))).mode & 0o777, 0o600);
    await assert.rejects(() => Promise.resolve(createBoundedLiveModel({ runId: 'run-b', model: mock(), evidenceDir }).doGenerate(params)), code('one_run_already_claimed'));
    sealBoundedLiveTest('run-b', 'failed', evidenceDir);
    assert.equal(JSON.parse(await readFile(path.join(evidenceDir, 'session.json'), 'utf8')).status, 'active');
    sealBoundedLiveTest('run-a', 'completed', evidenceDir);
    await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('session_sealed'));
  });
});

test('multimodal input and provider tools cannot enter the text-only cost envelope', async () => {
  for (const options of [
    { ...params, prompt: [{ role: 'user', content: [{ type: 'file', data: { type: 'url', url: 'https://example.com/image.png' }, mediaType: 'image/png' }] }] },
    { ...params, tools: [{ type: 'provider', id: 'google.google_search', name: 'google_search', args: {} }] },
  ] as LanguageModelV4CallOptions[]) {
    await directory(async evidenceDir => {
      let calls = 0;
      const model = createBoundedLiveModel({ runId: 'run-a', evidenceDir, model: mock(async () => { calls++; return result; }) });
      await assert.rejects(() => Promise.resolve(model.doGenerate(options)), LiveTestGuardError);
      assert.equal(calls, 0);
    });
  }
});

test('provider usage outside the reserved token envelope closes the allowance', async () => {
  await directory(async evidenceDir => {
    const provider = mock(async () => ({ ...result, usage: { ...result.usage, outputTokens: { total: 6001, text: 6001, reasoning: 0 } } }));
    const model = createBoundedLiveModel({ runId: 'run-a', model: provider, evidenceDir });
    await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('usage_outside_bound'));
    await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('session_sealed'));
  });
});

test('byte cap includes history metadata and tool schemas before any provider call', async () => {
  await directory(async evidenceDir => {
    let calls = 0;
    const model = createBoundedLiveModel({ runId: 'run-a', evidenceDir, model: mock(async () => { calls++; return result; }) });
    const oversized: LanguageModelV4CallOptions = { ...params, prompt: [{ role: 'assistant', content: [{ type: 'text', text: 'small', providerOptions: { google: { thoughtSignature: 'x'.repeat(32_000) } } }] }] };
    await assert.rejects(() => Promise.resolve(model.doGenerate(oversized)), code('request_too_large'));
    assert.equal(calls, 0);
    await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('session_sealed'));
  });
});

test('ten-call allowance persists across fresh wrapper instances', async () => {
  await directory(async evidenceDir => {
    let calls = 0;
    const provider = mock(async () => { calls++; return result; });
    for (let i = 0; i < LIVE_TEST_MAX_CALLS; i++) {
      await createBoundedLiveModel({ runId: 'run-a', model: provider, evidenceDir }).doGenerate(params);
    }
    await assert.rejects(() => Promise.resolve(createBoundedLiveModel({ runId: 'run-a', model: provider, evidenceDir }).doGenerate(params)), code('call_limit'));
    assert.equal(calls, 10);
  });
});

test('provider failure consumes session without leaking its payload or retrying', async () => {
  await directory(async evidenceDir => {
    let calls = 0;
    const provider = mock(async () => { calls++; throw Object.assign(new Error('private-key-and-payload'), { statusCode: 401, requestBody: 'private-key-and-payload' }); });
    const model = createBoundedLiveModel({ runId: 'run-a', model: provider, evidenceDir });
    await assert.rejects(() => Promise.resolve(model.doGenerate(params)), error => code('provider_failed')(error) && (error as LiveTestGuardError).statusCode === 401);
    const saved = await readFile(path.join(evidenceDir, 'session.json'), 'utf8');
    assert.ok(!saved.includes('private-key-and-payload'));
    assert.equal(JSON.parse(saved).calls[0].statusCode, 401);
    await assert.rejects(() => Promise.resolve(createBoundedLiveModel({ runId: 'run-a', model: provider, evidenceDir }).doGenerate(params)), code('session_sealed'));
    assert.equal(calls, 1);
  });
});

test('retains the actual Gateway denial message, code and IDs without copying raw SDK payloads', async () => {
  await directory(async evidenceDir => {
    const message = 'This model is not available on the free tier. Paid credits are required.';
    const providerError = new GatewayForbiddenError({
      message: 'Gateway request failed', generationId: 'gen_01M1MT7XK0J57BS3YFDM4GT442',
      cause: new APICallError({
        message, statusCode: 403, url: 'https://example.com/private-url', requestBodyValues: 'private-request-body',
        responseBody: 'private-raw-response', responseHeaders: { 'x-request-id': 'req_mock12345678', authorization: 'private-header' },
        data: { error: { message, code: 'MODEL_NOT_ALLOWED' }, private: 'private-response-data' },
      }),
    });
    const model = createBoundedLiveModel({ runId: 'run-a', evidenceDir, model: mock(async () => { throw providerError; }) });
    await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('provider_failed'));
    const saved = await readFile(path.join(evidenceDir, 'session.json'), 'utf8');
    assert.deepEqual(JSON.parse(saved).calls[0].providerDiagnostic, {
      type: 'forbidden', code: 'MODEL_NOT_ALLOWED', message,
      generationId: 'gen_01M1MT7XK0J57BS3YFDM4GT442', requestId: 'req_mock12345678',
    });
    assert.ok(!saved.includes('private-'));
    assert.equal(JSON.parse(saved).calls[0].statusCode, 403);
    await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('session_sealed'));
  });
});

test('redacts the configured key, credential patterns and reflected prompt from recognized messages', async () => {
  const previousKey = process.env.AI_GATEWAY_API_KEY;
  const configuredKey = 'test-configured-key-with-no-provider-prefix';
  process.env.AI_GATEWAY_API_KEY = configuredKey;
  try {
    await directory(async evidenceDir => {
      const privatePrompt = 'Confidential workshop brief for Private Customer.';
      const message = `Access denied. ${configuredKey}; Bearer token-for-test; api_key="assigned-secret"; sk-secret-for-test; ${privatePrompt} https://example.com/?token=url-secret`;
      const providerError = new GatewayForbiddenError({ message });
      const model = createBoundedLiveModel({ runId: 'run-a', evidenceDir, model: mock(async () => { throw providerError; }) });
      await assert.rejects(() => Promise.resolve(model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: privatePrompt }] }] })), code('provider_failed'));
      const saved = await readFile(path.join(evidenceDir, 'session.json'), 'utf8');
      for (const secret of [configuredKey, 'token-for-test', 'assigned-secret', 'sk-secret-for-test', privatePrompt, 'url-secret']) assert.ok(!saved.includes(secret));
      const diagnostic = JSON.parse(saved).calls[0].providerDiagnostic;
      assert.match(diagnostic.message, /^Access denied\./);
      assert.match(diagnostic.message, /\[redacted request content\]/);
      assert.equal(diagnostic.messageRedacted, true);
    });
  } finally {
    if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousKey;
  }
});

test('marks partial prompt echoes and embedded request data as omitted', async () => {
  for (const message of ['Rejected: Confidential workshop notes', 'Rejected request: {"private":"customer-data"}']) {
    await directory(async evidenceDir => {
      const providerError = new GatewayForbiddenError({ message });
      const model = createBoundedLiveModel({ runId: 'run-a', evidenceDir, model: mock(async () => { throw providerError; }) });
      await assert.rejects(() => Promise.resolve(model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'Confidential workshop notes for a private customer.' }] }] })), code('provider_failed'));
      const saved = await readFile(path.join(evidenceDir, 'session.json'), 'utf8');
      assert.ok(!saved.includes(message));
      assert.equal(JSON.parse(saved).calls[0].providerDiagnostic.messageOmitted, true);
    });
  }
});

test('an in-flight reservation blocks concurrent or resumed calls and streaming', async () => {
  await directory(async evidenceDir => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const provider = mock(async () => { await waiting; return result; });
    const model = createBoundedLiveModel({ runId: 'run-a', model: provider, evidenceDir });
    const pending = model.doGenerate(params);
    await assert.rejects(() => Promise.resolve(createBoundedLiveModel({ runId: 'run-a', model: provider, evidenceDir }).doGenerate(params)), code('pending_or_failed_call'));
    await assert.rejects(() => Promise.resolve(model.doStream(params)), code('streaming_not_allowed'));
    release();
    await pending;
  });
});
