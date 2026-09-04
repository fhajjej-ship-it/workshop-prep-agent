import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { createDirectLiveAllowance, createBoundedDirectGoogleModel, sealDirectLiveTest, DirectLiveTestError } from '../lib/direct-live-test';

const params: LanguageModelV4CallOptions = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'Synthetic workshop.' }] }] };
const key = 'placeholder-direct-google-key';
const response = (extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
  candidates: [{ content: { role: 'model', parts: [{ text: 'Mock response.' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 12, thoughtsTokenCount: 8, totalTokenCount: 100, serviceTier: 'standard' },
  modelVersion: 'gemini-3.8-flash', responseId: 'google_response_mock', ...extra,
}), { headers: { 'content-type': 'application/json' } });
const code = (expected: string) => (error: unknown) => error instanceof DirectLiveTestError && error.code === expected;
async function fixture(fn: (evidenceDir: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(process.cwd(), '.local-test-direct-'));
  const originalEnvironment = process.env;
  process.env = { NODE_ENV: 'test', GOOGLE_GENERATIVE_AI_API_KEY: key };
  try { await fn(directory); } finally { process.env = originalEnvironment; await rm(directory, { recursive: true, force: true }); }
}
const ledger = async (directory: string) => JSON.parse(await readFile(path.join(directory, 'session.json'), 'utf8'));

test('exclusive allowance reserves exact final Google request, captures usage and seals without more network', async () => fixture(async evidenceDir => {
  assert.throws(() => createBoundedDirectGoogleModel({ runId: 'run-a', evidenceDir }), code('allowance_not_initialized'));
  createDirectLiveAllowance('run-a', evidenceDir);
  assert.throws(() => createDirectLiveAllowance('run-a', evidenceDir), code('allowance_already_exists'));
  let calls = 0;
  const model = createBoundedDirectGoogleModel({ runId: 'run-a', evidenceDir, fetch: async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(init!.body as string);
    assert.equal(body.generationConfig.maxOutputTokens, 6000);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal(body.serviceTier, 'standard');
    assert.equal(body.cachedContent, undefined);
    const saved = await ledger(evidenceDir);
    assert.equal(saved.calls[0].status, 'pending');
    assert.equal(saved.calls[0].requestBytes, Buffer.byteLength(init!.body as string));
    return response();
  } });
  await model.doGenerate({ ...params, maxOutputTokens: 9000, reasoning: 'high', providerOptions: { google: { serviceTier: 'priority', cachedContent: 'cachedContents/not-allowed' } } });
  const saved = await ledger(evidenceDir);
  assert.equal(saved.calls[0].usage.output_total, 20);
  assert.equal(saved.calls[0].googleUsage.thoughtsTokenCount, 8);
  assert.equal(saved.calls[0].responseId, 'google_response_mock');
  assert.equal(saved.calls[0].modelVersion, 'gemini-3.8-flash');
  assert.equal(saved.calls[0].estimatedCostUSD, 0.000135);
  sealDirectLiveTest('run-a', 'completed', evidenceDir);
  await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('session_sealed'));
  assert.equal(calls, 1);
}));

test('final serialized byte cap and nested media block before transport and seal the allowance', async () => {
  for (const options of [
    { prompt: [{ role: 'user', content: [{ type: 'text', text: 'x'.repeat(32_000) }] }] },
    { prompt: [{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-a', toolName: 'read', output: { type: 'content', value: [{ type: 'file', data: { type: 'url', url: 'https://example.com/private' }, mediaType: 'image/png' }] } }] }] },
  ] as LanguageModelV4CallOptions[]) await fixture(async evidenceDir => {
    createDirectLiveAllowance('run-a', evidenceDir);
    let calls = 0;
    const model = createBoundedDirectGoogleModel({ runId: 'run-a', evidenceDir, fetch: async () => { calls++; return response(); } });
    await assert.rejects(() => Promise.resolve(model.doGenerate(options)), DirectLiveTestError);
    assert.equal(calls, 0);
    assert.equal((await ledger(evidenceDir)).status, 'failed');
    await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('session_sealed'));
  });
});

test('Google failures preserve sanitized status/message/code and prevent a retry', async () => fixture(async evidenceDir => {
  createDirectLiveAllowance('run-a', evidenceDir);
  let calls = 0;
  const model = createBoundedDirectGoogleModel({ runId: 'run-a', evidenceDir, fetch: async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: `Access denied. ${key}; Bearer mock-token; Synthetic workshop.`, details: [{ private: 'never-save-details' }] } }),
      { status: 403, headers: { 'content-type': 'application/json', 'x-request-id': 'google_error_mock', 'private-header': 'never-save-header' } });
  } });
  await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('provider_failed'));
  const saved = await ledger(evidenceDir);
  const detail = saved.calls[0].diagnostic;
  assert.equal(detail.code, 403);
  assert.equal(detail.status, 'PERMISSION_DENIED');
  assert.equal(detail.requestId, 'google_error_mock');
  assert.match(detail.message, /^Access denied\./);
  assert.equal(detail.messageRedacted, true);
  for (const privateValue of [key, 'mock-token', 'Synthetic workshop.', 'never-save-details', 'never-save-header']) assert.ok(!JSON.stringify(saved).includes(privateValue));
  await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('session_sealed'));
  assert.equal(calls, 1);
}));

test('thinking tokens count against output cap and failed response checks retain usage and identity', async () => fixture(async evidenceDir => {
  createDirectLiveAllowance('run-a', evidenceDir);
  const model = createBoundedDirectGoogleModel({ runId: 'run-a', evidenceDir, fetch: async () => response({
    usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 1, thoughtsTokenCount: 6000, totalTokenCount: 6081 },
  }) });
  await assert.rejects(() => Promise.resolve(model.doGenerate(params)), code('usage_outside_bound'));
  const saved = await ledger(evidenceDir);
  assert.equal(saved.status, 'failed');
  assert.equal(saved.calls[0].usage.output_total, 6001);
  assert.equal(saved.calls[0].googleUsage.thoughtsTokenCount, 6000);
  assert.equal(saved.calls[0].responseId, 'google_response_mock');
  assert.equal(saved.calls[0].modelVersion, 'gemini-3.8-flash');
}));

test('ten-call limit survives separate model instances and streaming is blocked', async () => fixture(async evidenceDir => {
  createDirectLiveAllowance('run-a', evidenceDir);
  let calls = 0;
  const fetch = async () => { calls++; return response(); };
  for (let i = 0; i < 10; i++) await createBoundedDirectGoogleModel({ runId: 'run-a', evidenceDir, fetch }).doGenerate(params);
  assert.throws(() => createBoundedDirectGoogleModel({ runId: 'run-a', evidenceDir, fetch }), code('call_limit'));
  assert.equal(calls, 10);
  sealDirectLiveTest('run-a', 'completed', evidenceDir);
}));
