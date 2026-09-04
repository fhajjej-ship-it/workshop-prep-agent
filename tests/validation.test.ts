import assert from 'node:assert/strict';
import test from 'node:test';
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
