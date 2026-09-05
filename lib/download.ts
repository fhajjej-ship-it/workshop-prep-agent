import type { Run } from './types';
import { getRunMaterials, usesExampleMaterials } from './materials';

export function packProvenance(run: Run) {
  const examples = usesExampleMaterials(getRunMaterials(run));
  return { synthetic: run.mode === 'test' || examples, humanReviewRequired: true, liveModelUsed: run.mode === 'live', sourceKind: examples ? 'example' : 'supplied' };
}

export type ExportBlock = {
  kind: 'title' | 'heading' | 'subheading' | 'paragraph' | 'quote' | 'bullet' | 'number' | 'meta' | 'source' | 'timeline';
  text: string;
  number?: number;
  pageBreakBefore?: boolean;
  keepWithNext?: boolean;
  minimumFollowingSpace?: number;
  timeline?: {
    totalMinutes: number;
    segments: { number: number; minutes: number; start: number; end: number; color: string; textColor: string }[];
  };
};

const timelineColors = ['#193A50', '#336375', '#36847F', '#70A59D', '#9BC0B6'];

/** Saved text only: every document format consumes the same content blocks. */
export function packExportBlocks(run: Run): ExportBlock[] {
  const pack = run.pack!;
  const exampleSources = usesExampleMaterials(getRunMaterials(run));
  const provenance = run.mode === 'test' ? 'Deterministic test output. No live model was used.' : `Live model: ${run.model}.`;
  const description = exampleSources ? 'Synthetic standalone prototype.' : run.mode === 'test'
    ? 'Scripted workshop fixture. Content is not derived from the supplied documents; references test citation wiring only.'
    : 'Workshop preparation from supplied materials.';
  const readerNotice = !exampleSources && run.mode === 'live'
    ? 'Prepared from supplied materials. Review before use.'
    : `${description} ${provenance} Human review required.`;
  const blocks: ExportBlock[] = [];
  const titles = new Map(pack.sources.map(source => [source.id, source.title]));
  const sourceNames = (ids: string[]) => ids.map(id => titles.get(id) ?? 'Source title unavailable').join('; ');
  const readableReferences = (text: string) => {
    let output = text;
    for (const [id, title] of titles) output = output.replaceAll(`[${id}]`, `[Source: ${title}]`)
      .replace(new RegExp(`\\b(?:source-)?${id.replace(/^source-/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), title);
    return output.replace(/(?:source-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, 'Source reference');
  };
  const add = (kind: ExportBlock['kind'], text: string, options: Partial<ExportBlock> = {}) => blocks.push({ kind, text: readableReferences(text), ...options });
  const paragraph = (text: string) => add('paragraph', text);
  add('title', pack.title);
  add('quote', readerNotice);
  add('heading', 'Workshop brief');
  add('meta', `Audience: ${run.brief.audience}`);
  add('meta', `Goal: ${run.brief.objective}`);
  add('meta', `Duration: ${run.brief.durationMinutes} minutes · Format: ${run.brief.format}`);
  add('meta', `Constraints: ${run.brief.constraints || 'None supplied'}`);
  if (run.parentRunId && run.feedback) add('meta', `Revision request: ${run.feedback}`);
  add('heading', 'Intended outcome'); paragraph(pack.outcome);
  let timelineElapsed = 0;
  const timelineSegments = pack.agenda.map((item, index) => {
    const start = timelineElapsed;
    timelineElapsed += item.minutes;
    return { number: index + 1, minutes: item.minutes, start, end: timelineElapsed,
      color: timelineColors[index % timelineColors.length], textColor: index % timelineColors.length === 4 ? '#183245' : '#FFFFFF' };
  });
  const hasTimeline = timelineSegments.length > 0 && timelineSegments.every(segment => segment.minutes > 0);
  add('heading', 'Agenda', { keepWithNext: hasTimeline });
  if (hasTimeline) blocks.push({
    kind: 'timeline',
    text: `Session timeline. ${timelineSegments.map(segment => `Section ${segment.number}: ${segment.minutes} minutes, ${segment.start}–${segment.end} elapsed`).join('; ')}.`,
    timeline: { totalMinutes: timelineElapsed, segments: timelineSegments },
  });
  if (run.workflowVersion === 2) paragraph('The agenda and exercise below are proposed workshop design informed by the sources.');
  let elapsed = 0;
  for (const item of pack.agenda) {
    const start = elapsed; elapsed += item.minutes;
    add('subheading', `${start}–${elapsed} min · ${item.title}`, { keepWithNext: true });
    add('paragraph', item.activity, { keepWithNext: true });
    add('source', `Sources: ${sourceNames(item.sourceIds)}`);
  }
  add('heading', `Exercise: ${pack.exercise.title}`);
  if (pack.exercise.durationMinutes) paragraph(`Duration: ${pack.exercise.durationMinutes} minutes`);
  const sectionIndex = pack.exercise.agendaSectionIndex;
  if (typeof sectionIndex === 'number' && pack.agenda[sectionIndex]) paragraph(`Agenda section ${sectionIndex + 1}: ${pack.agenda[sectionIndex].title}`);
  if (pack.exercise.scenario) { add('subheading', 'Scenario and input'); paragraph(pack.exercise.scenario); }
  if (pack.exercise.expectedOutput) { add('subheading', 'Expected output'); paragraph(pack.exercise.expectedOutput); }
  add('subheading', 'Instructions');
  pack.exercise.instructions.forEach((text, index) => add('number', text, { number: index + 1 }));
  if (pack.exercise.sampleResponse) { add('subheading', 'Sample response'); paragraph(pack.exercise.sampleResponse); }
  add('subheading', 'Debrief');
  pack.exercise.debrief.forEach(text => add('bullet', text));
  add('source', `Sources: ${sourceNames(pack.exercise.sourceIds)}`);
  add('heading', 'Facilitator notes');
  pack.facilitatorNotes.forEach(text => add('bullet', text));
  if (pack.sourceClaims?.length) {
    add('heading', 'Source-supported claims');
    for (const [index, claim] of pack.sourceClaims.entries()) {
      add('subheading', `Claim ${index + 1}`, { keepWithNext: true, minimumFollowingSpace: 150 });
      add('paragraph', claim.claim, { keepWithNext: true });
      add('source', `Evidence from ${titles.get(claim.sourceId) ?? 'source title unavailable'}`, { keepWithNext: true });
      add('quote', claim.quote);
    }
  }
  add('heading', exampleSources ? 'Provided synthetic sources' : 'Supplied sources');
  pack.sources.forEach(source => add('bullet', source.title));
  add('heading', 'Quality and review');
  add('subheading', 'Automated checks');
  paragraph(`${run.validation?.totalMinutes} minutes; required sections and source reference integrity passed.`);
  paragraph('These checks establish structure, timing and reference/passage integrity, not factual accuracy or instructional quality.');
  if (run.contentReview) {
    add('subheading', 'Content review');
    paragraph(`${run.contentReview.mode === 'model' ? 'Model-assisted judgment' : 'Scripted review fixture, not a content quality assessment'}: ${run.contentReview.status === 'passed' ? 'passed' : 'issues remain'} for revision ${run.contentReview.reviewedRevision}.`);
    Object.entries(run.contentReview.checks).forEach(([area, check]) => add('bullet', `${area}: ${check.passed ? 'passed' : 'needs revision'} — ${check.reason}`));
    paragraph('A model-assisted pass is not certification. Human review is still required.');
  } else paragraph('Content review was not recorded for this historical workflow.');
  return blocks;
}

export function exportBlockText(block: ExportBlock): string {
  return block.kind === 'bullet' ? `• ${block.text}` : block.kind === 'number' ? `${block.number}. ${block.text}` : block.text;
}

/** Treat common model-escaped line breaks as layout only in binary documents. */
export function documentBlockText(block: ExportBlock): string {
  return exportBlockText(block).replace(/\\r\\n|\\n|\\r/g, '\n');
}

export function documentBlockContent(block: ExportBlock): string {
  return block.text.replace(/\\r\\n|\\n|\\r/g, '\n');
}

export function packMarkdown(run: Run) {
  const pack = run.pack!;
  const exampleSources = usesExampleMaterials(getRunMaterials(run));
  const provenance = run.mode === 'test' ? 'Deterministic test output. No live model was used.' : `Live model: ${run.model}.`;
  const description = exampleSources ? 'Synthetic standalone prototype.' : run.mode === 'test'
    ? 'Scripted workshop fixture. Content is not derived from the supplied documents; references test citation wiring only.'
    : 'Workshop preparation from supplied materials.';
  let elapsed = 0;
  return [
    `# ${pack.title}`, '', `> ${description} ${provenance} Human review required.`, '',
    `Run: ${run.id} · Revision ${run.revision}`, '',
    ...(run.parentRunId ? [`Derived from run: ${run.parentRunId}`, `Requested revision: ${run.feedback ?? ''}`, ''] : []),
    `Audience: ${run.brief.audience}`, `Objective: ${run.brief.objective}`, `Duration: ${run.brief.durationMinutes} minutes`,
    `Format: ${run.brief.format}`, `Constraints: ${run.brief.constraints || 'None supplied'}`, '',
    '## Intended outcome', '', pack.outcome, '', '## Agenda', '',
    ...(run.workflowVersion === 2 ? ['The agenda and exercise below are proposed workshop design informed by the sources.', ''] : []),
    ...pack.agenda.flatMap(item => {
      const start = elapsed; elapsed += item.minutes;
      return [`### ${start}–${elapsed} min · ${item.title}`, '', item.activity, '', `Sources: ${item.sourceIds.map(id => `[${id}]`).join(', ')}`, ''];
    }),
    `## Exercise: ${pack.exercise.title}`, '',
    ...(pack.exercise.durationMinutes ? [`Duration: ${pack.exercise.durationMinutes} minutes`, ''] : []),
    ...(pack.exercise.scenario ? ['### Scenario and input', '', pack.exercise.scenario, ''] : []),
    ...(pack.exercise.expectedOutput ? ['### Expected output', '', pack.exercise.expectedOutput, ''] : []),
    '### Instructions', '', ...pack.exercise.instructions.map((line, index) => `${index + 1}. ${line}`), '',
    ...(pack.exercise.sampleResponse ? ['### Sample response', '', pack.exercise.sampleResponse, ''] : []),
    '### Debrief', '', ...pack.exercise.debrief.map(line => `- ${line}`), '',
    `Sources: ${pack.exercise.sourceIds.map(id => `[${id}]`).join(', ')}`, '',
    '## Facilitator notes', '', ...pack.facilitatorNotes.map(line => `- ${line}`), '',
    ...(pack.sourceClaims?.length ? ['## Source-supported claims', '', ...pack.sourceClaims.flatMap(claim => [claim.claim, '', `Supporting passage [${claim.sourceId}]:`, '', ...claim.quote.split('\n').map(line => `> ${line}`), ''])] : []),
    exampleSources ? '## Provided synthetic sources' : '## Supplied sources', '', ...pack.sources.map(source => `- [${source.id}] ${source.title}`), '',
    '## Automated checks', '', `${run.validation?.totalMinutes} minutes; required sections and source reference integrity passed.`,
    'These checks establish structure, timing and reference/passage integrity, not factual accuracy or instructional quality.', '',
    ...(run.contentReview ? ['## Content review', '', `${run.contentReview.mode === 'model' ? 'Model-assisted judgment' : 'Scripted review fixture, not a content quality assessment'}: ${run.contentReview.status === 'passed' ? 'passed' : 'issues remain'} for revision ${run.contentReview.reviewedRevision}.`, '', ...Object.entries(run.contentReview.checks).map(([area, check]) => `- ${area}: ${check.passed ? 'passed' : 'needs revision'} — ${check.reason}`), '', 'A model-assisted pass is not certification. Human review is still required.', ''] : ['Content review was not recorded for this historical workflow.', '']),
  ].join('\n');
}
