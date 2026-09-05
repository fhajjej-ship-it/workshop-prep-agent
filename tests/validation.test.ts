import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogle } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { materials } from '../lib/materials';
import { createTestPack } from '../lib/test-pack';
import type { Brief } from '../lib/types';
import { briefSchema, packSchema, validatePack } from '../lib/validation';

const brief: Brief = {
  audience: 'Executive leadership team',
  objective: 'Choose a safe first AI experiment and define how to evaluate it.',
  durationMinutes: 90,
  constraints: 'No model accounts required; use fictional material only.',
  format: 'remote',
};
const readIds = materials.map(({ id }) => id);

test('validator feedback catches an overlong draft and accepts the revised pack', () => {
  const invalid = validatePack(createTestPack(brief, { invalid: true }), brief, readIds);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.totalMinutes, 100);
  assert.match(invalid.issues.join(' '), /must equal.*90 minutes/);
  const revised = createTestPack(brief);
  assert.deepEqual(validatePack(revised, brief, readIds), { valid: true, totalMinutes: 90, issues: [] });
  assert.ok(revised.outcome.includes(brief.audience));
  assert.ok(revised.outcome.includes(brief.objective));
  assert.ok(revised.exercise.instructions.some((instruction) => instruction.includes(brief.constraints)));
  assert.ok(revised.exercise.instructions[0].includes('breakout'));
});

test('empty but well-shaped draft receives required-section feedback', () => {
  const pack = createTestPack(brief);
  pack.agenda = [];
  pack.exercise.instructions = [];
  pack.exercise.debrief = [];
  pack.facilitatorNotes = [];
  assert.equal(packSchema.safeParse(pack).success, true);
  const result = validatePack(pack, brief, readIds);
  assert.equal(result.valid, false);
  assert.match(result.issues.join(' '), /at least three sections/);
  assert.match(result.issues.join(' '), /three actionable instructions/);
  assert.match(result.issues.join(' '), /two debrief questions/);
  assert.match(result.issues.join(' '), /two substantive notes/);
});

test('rejects unknown, unread, duplicate and misnamed source declarations', () => {
  const pack = createTestPack(brief);
  pack.sources[0].title = 'Fabricated source title';
  pack.sources.push({ ...pack.sources[0] }, { id: 'imaginary-source', title: 'Invented' });
  pack.agenda[0].sourceIds = ['imaginary-source'];
  const result = validatePack(pack, brief, ['facilitation-guide']);
  assert.equal(result.valid, false);
  for (const pattern of [/exactly match/, /Duplicate declared/, /Unknown declared/, /was not read/, /cites unknown/]) {
    assert.match(result.issues.join(' '), pattern);
  }
});

test('requires source coverage for agenda, exercise and facilitator notes', () => {
  const pack = createTestPack(brief);
  pack.agenda[0].sourceIds = [];
  pack.exercise.sourceIds = [];
  pack.facilitatorNotes[0] = 'A substantive note which does not cite any source material.';
  const result = validatePack(pack, brief, readIds);
  assert.equal(result.issues.filter((issue) => issue.includes('needs at least one source reference')).length, 3);
});

test('repeated inline citations do not require rewriting a valid facilitator note', () => {
  const pack = createTestPack(brief);
  const sourceId = pack.sources[0].id;
  pack.facilitatorNotes[0] = `Introduce the source before the exercise [${sourceId}]. Return to that source during the debrief [${sourceId}].`;
  assert.deepEqual(validatePack(pack, brief, readIds), { valid: true, totalMinutes: 90, issues: [] });

  // Explicit source lists remain unique; this exception only applies to prose.
  pack.agenda[0].sourceIds = [sourceId, sourceId];
  assert.match(validatePack(pack, brief, readIds).issues.join(' '), /Agenda section 1 has duplicate source reference/);
});

test('repeated inline citations still require known, declared and read sources', () => {
  for (const kind of ['unknown', 'undeclared', 'unread'] as const) {
    const pack = createTestPack(brief);
    const sourceId = kind === 'unknown' ? 'missing-source' : pack.sources[0].id;
    if (kind === 'undeclared') pack.sources = pack.sources.filter(source => source.id !== sourceId);
    pack.facilitatorNotes[0] = `Explain this reference to participants [${sourceId}]. Review it again at the end [${sourceId}].`;
    const result = validatePack(pack, brief, kind === 'unread' ? readIds.filter(id => id !== sourceId) : readIds);
    const noteIssues = result.issues.filter(issue => issue.startsWith('Facilitator note 1'));
    assert.equal(result.valid, false);
    assert.match(noteIssues.join(' '), kind === 'unread' ? /was not read/ : new RegExp(`cites ${kind} source`));
  }
});

test('detects zero-duration sections even when total duration is unchanged', () => {
  const pack = createTestPack(brief);
  pack.agenda[1].minutes += pack.agenda[0].minutes;
  pack.agenda[0].minutes = 0;
  assert.equal(packSchema.safeParse(pack).success, true);
  const result = validatePack(pack, brief, readIds);
  assert.equal(result.totalMinutes, 90);
  assert.equal(result.valid, false);
  assert.match(result.issues.join(' '), /positive whole-minute duration/);
});

test('brief permits missing format while bounding duration and input shape', () => {
  assert.equal(briefSchema.safeParse({ ...brief, format: '' }).success, true);
  assert.equal(briefSchema.safeParse({ ...brief, durationMinutes: 29 }).success, false);
  assert.equal(briefSchema.safeParse({ ...brief, durationMinutes: 241 }).success, false);
  assert.equal(briefSchema.safeParse({ ...brief, durationMinutes: 90.5 }).success, false);
  assert.equal(briefSchema.safeParse({ ...brief, mode: 'live' }).success, false);
});

test('worked answer field accepts its existing 3000-character boundary and rejects overflow', () => {
  const pack = createTestPack(brief);
  pack.exercise.sampleResponse = 'A'.repeat(3000);
  assert.equal(packSchema.safeParse(pack).success, true);
  pack.exercise.sampleResponse += 'A';
  const parsed = packSchema.safeParse(pack);
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.ok(parsed.error.issues.some(issue => issue.code === 'too_big'
    && issue.path.join('.') === 'exercise.sampleResponse' && issue.maximum === 3000));
});

test('Google tool requests retain numerical field limits in descriptions when maxLength is omitted', async () => {
  let captured: Record<string, any> | undefined;
  let requests = 0;
  const google = createGoogle({ apiKey: 'schema-test-placeholder', fetch: async (_url, init) => {
    requests += 1;
    captured = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Schema capture fixture' } }),
      { status: 403, headers: { 'content-type': 'application/json' } });
  } });
  await assert.rejects(() => generateText({
    model: google('gemini-3.8-flash'), prompt: 'Inspect the tool schema.',
    tools: { draft_pack: tool({ inputSchema: packSchema }) }, maxRetries: 0,
  }));
  assert.equal(requests, 1);
  const properties = captured?.tools?.[0]?.functionDeclarations?.[0]?.parameters?.properties;
  assert.ok(properties, 'The actual Google request must contain the converted tool schema.');
  const exercise = properties.exercise.properties;
  assert.equal(exercise.sampleResponse.maxLength, undefined);
  assert.match(exercise.sampleResponse.description, /Maximum 3000 characters/);
  assert.match(exercise.sampleResponse.description, /2400 characters/);
  assert.match(exercise.scenario.description, /Maximum 3000 characters/);
  assert.match(exercise.instructions.items.description, /Maximum 3000 characters per instruction/);
  assert.match(properties.facilitatorNotes.items.description, /Maximum 3000 characters per note/);
  assert.match(properties.title.description, /180 characters/);
  assert.match(properties.sourceClaims.items.properties.quote.description, /1200 characters/);
});
