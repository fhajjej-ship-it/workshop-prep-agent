import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { LIVE_MODEL, LIVE_PROVIDER } from '../lib/config';
import { createDirectGoogleModel } from '../lib/direct-model';

const params: LanguageModelV4CallOptions = {
  prompt: [{ role: 'user', content: [{ type: 'text', text: 'Synthetic workshop.' }] }],
  reasoning: 'low', maxOutputTokens: 6000,
};
const environment = { NODE_ENV: 'test' as const, WORKSHOP_MODE: 'live', WORKSHOP_STORE: 'local', GOOGLE_GENERATIVE_AI_API_KEY: 'placeholder-google-key' };
const postgres = { WORKSHOP_STORE: 'postgres', DATABASE_URL: 'postgresql://test:test@example.test/workshop' };

test('native direct Google model is lazy and sends only the explicitly invoked mocked request', async t => {
  const originalEnvironment = process.env;
  process.env = { ...environment, AI_GATEWAY_API_KEY: 'placeholder-gateway-key' };
  t.after(() => { process.env = originalEnvironment; });
  let networkCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    networkCalls++;
    assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'placeholder-google-key');
    const body = JSON.parse(init!.body as string);
    assert.equal(body.generationConfig.maxOutputTokens, 6000);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    return new Response(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: 'Mock direct output.' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      modelVersion: LIVE_MODEL,
    }), { headers: { 'content-type': 'application/json' } });
  });
  const model = createDirectGoogleModel();
  assert.equal(model.specificationVersion, 'v4');
  assert.equal(model.modelId, LIVE_MODEL);
  assert.equal(model.provider, LIVE_PROVIDER);
  assert.equal(networkCalls, 0);
  assert.equal((await model.doGenerate(params)).content[0].type, 'text');
  assert.equal(networkCalls, 1);
});

test('missing direct key and unapproved or invalid hosted configuration cannot invoke the native provider', t => {
  const originalEnvironment = process.env;
  t.after(() => { process.env = originalEnvironment; });
  let networkCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { networkCalls++; throw new Error('Unexpected network request.'); });
  for (const key of [undefined, '', '   ']) {
    process.env = { ...environment, AI_GATEWAY_API_KEY: 'placeholder-gateway-key', GOOGLE_GENERATIVE_AI_API_KEY: key };
    assert.throws(createDirectGoogleModel, /requires GOOGLE_GENERATIVE_AI_API_KEY/);
  }
  for (const override of [
    { VERCEL: '1' }, { ...postgres, VERCEL: '1' },
    { VERCEL: '1', WORKSHOP_ALLOW_HOSTED_LIVE: 'true' },
    { VERCEL: '1', WORKSHOP_ALLOW_HOSTED_LIVE: 'true', WORKSHOP_STORE: 'postgres' },
    { WORKSHOP_STORE: 'postgres' }, { WORKSHOP_MODE: 'test' }, { WORKSHOP_MODEL: 'unsupported' },
  ]) {
    process.env = { ...environment, ...override };
    assert.throws(createDirectGoogleModel, /valid live configuration/);
  }
  for (const override of [postgres, { ...postgres, VERCEL: '1', WORKSHOP_ALLOW_HOSTED_LIVE: 'true' }]) {
    process.env = { ...environment, ...override };
    assert.equal(createDirectGoogleModel().modelId, LIVE_MODEL);
  }
  assert.equal(networkCalls, 0);
});
