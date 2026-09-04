import { materials } from './materials';
import type { Brief, WorkshopPack } from './types';

/** A predictable fixture for testing workflow mechanics; no model is involved. */
export function createTestPack(brief: Brief, options?: { invalid?: boolean }): WorkshopPack {
  const framing = Math.round(brief.durationMinutes * 0.15);
  const selection = Math.round(brief.durationMinutes * 0.2);
  const practice = Math.round(brief.durationMinutes * 0.45);
  const review = brief.durationMinutes - framing - selection - practice;
  const delivery = brief.format === 'remote'
    ? 'Work in breakout pairs using a shared text template.'
    : brief.format === 'hybrid'
      ? 'Use one shared text template for everyone and invite remote voices first.'
      : brief.format === 'in-person'
        ? 'Work in pairs with paper experiment cards.'
        : 'Delivery format is unspecified; confirm it before facilitating.';
  const constraints = brief.constraints.trim() || 'No additional constraints supplied.';
  const objective = /[.!?]$/.test(brief.objective.trim()) ? brief.objective.trim() : `${brief.objective.trim()}.`;
  return {
    title: 'From AI possibility to a safe first experiment',
    outcome: `Synthetic test pack for ${brief.audience}. Requested objective: ${objective} The fixed template produces a proposed experiment card for human review; it does not establish business results.`,
    agenda: [
      {
        title: 'Frame the decision',
        minutes: framing,
        activity: `Agree what ${brief.audience} need to decide. Restate the requested objective: ${objective} Introduce the fictional operations-summary example and the exercise boundary.`,
        sourceIds: ['facilitation-guide', 'safe-experimentation'],
      },
      {
        title: 'Choose one useful task',
        minutes: selection,
        activity: 'Compare invented recurring tasks by frequency, review effort, sensitivity and consequence of error. Choose one reversible task and name the person accountable for its output.',
        sourceIds: ['use-case-selection'],
      },
      {
        title: 'Build an experiment card',
        minutes: practice + (options?.invalid ? 10 : 0),
        activity: `${delivery} Run the experiment-card exercise below using fictional material only. Include time for participants to question unsupported assumptions.`,
        sourceIds: ['use-case-selection', 'safe-experimentation', 'facilitation-guide'],
      },
      {
        title: 'Review, debrief and decide',
        minutes: review,
        activity: 'Debrief the exercise, check each proposed benefit against available evidence and record an owner, success measure, human review point, stop condition and unresolved question.',
        sourceIds: ['facilitation-guide', 'safe-experimentation'],
      },
    ],
    exercise: {
      title: 'The one-page experiment card',
      instructions: [
        `${delivery} Use this invented scenario: a team manually turns a fictional weekly operations update into a short leadership summary.`,
        'Describe the current task and who reviews its output. List two alternative tasks, then justify which is most suitable for a small, reversible experiment.',
        'Write a proposed input, expected draft output and acceptance check. Use invented content; do not use real customer, employee or confidential information.',
        'Add a baseline to collect, a success measure, an owner and a stop condition. Mark expected time savings as a hypothesis, not a result.',
        `Review the card against the brief: ${objective} Record how the facilitator should handle these supplied constraints: ${constraints}`,
      ],
      debrief: [
        'Which claim in your card still needs evidence, and what would change your decision?',
        'What must a human check before using the output, and when should the experiment stop?',
      ],
      sourceIds: ['use-case-selection', 'safe-experimentation', 'facilitation-guide'],
    },
    facilitatorNotes: [
      'This pack is produced by a deterministic test adapter. It repeats a fixed synthetic exercise and inserts brief details; a human must assess its suitability for the stated audience and requested objective. [facilitation-guide]',
      `Delivery: ${brief.format || 'unconfirmed'}. ${delivery} Keep exercise and debrief inside the ${brief.durationMinutes}-minute agenda. [facilitation-guide]`,
      'Review the supplied constraints in exercise instruction 5 before facilitating. Use invented text only, keep outputs advisory and stop if sensitive information or an operational action becomes necessary. [safe-experimentation]',
      'Close with a proposed experiment and a measurement plan. No customer outcome, deployment, affiliation or financial return is established by this synthetic workshop. [use-case-selection]',
    ],
    sources: materials.map(({ id, title }) => ({ id, title })),
  };
}
