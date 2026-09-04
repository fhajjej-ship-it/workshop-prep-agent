import type { Run } from './types';

export function packMarkdown(run: Run) {
  const pack = run.pack!;
  const provenance = run.mode === 'test' ? 'Deterministic test output. No live model was used.' : `Live model: ${run.model}.`;
  let elapsed = 0;
  return [
    `# ${pack.title}`, '', `> Synthetic standalone prototype. ${provenance} Human review required.`, '',
    `Run: ${run.id} · Revision ${run.revision}`, '',
    `Audience: ${run.brief.audience}`, `Objective: ${run.brief.objective}`, `Duration: ${run.brief.durationMinutes} minutes`,
    `Format: ${run.brief.format}`, `Constraints: ${run.brief.constraints || 'None supplied'}`, '',
    '## Intended outcome', '', pack.outcome, '', '## Agenda', '',
    ...pack.agenda.flatMap(item => {
      const start = elapsed; elapsed += item.minutes;
      return [`### ${start}–${elapsed} min · ${item.title}`, '', item.activity, '', `Sources: ${item.sourceIds.map(id => `[${id}]`).join(', ')}`, ''];
    }),
    `## Exercise: ${pack.exercise.title}`, '',
    ...pack.exercise.instructions.map((line, index) => `${index + 1}. ${line}`), '',
    '### Debrief', '', ...pack.exercise.debrief.map(line => `- ${line}`), '',
    `Sources: ${pack.exercise.sourceIds.map(id => `[${id}]`).join(', ')}`, '',
    '## Facilitator notes', '', ...pack.facilitatorNotes.map(line => `- ${line}`), '',
    '## Provided synthetic sources', '', ...pack.sources.map(source => `- [${source.id}] ${source.title}`), '',
    '## Automated checks', '', `${run.validation?.totalMinutes} minutes; required sections and source reference integrity passed.`,
    'These checks do not establish factual accuracy, suitability, or instructional quality.', '',
  ].join('\n');
}
