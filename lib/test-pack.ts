import { materials, usesExampleMaterials } from './materials';
import type { Brief, Material, WorkshopPack } from './types';

/** A predictable fixture for testing workflow mechanics; no model is involved. */
export function createTestPack(brief: Brief, options?: { invalid?: boolean; materials?: Material[]; feedback?: string }): WorkshopPack {
  const sources = options?.materials ?? materials;
  if (sources.length === 0) throw new Error('The scripted fixture needs at least one supplied material.');
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
  const pack: WorkshopPack = {
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
      scenario: 'Fictional practice input: a small operations team prepares a weekly leadership summary. This week, task A finished on time, task B is two days late awaiting a supplier reply, and task C needs a manager decision by Friday. A coordinator copies these updates into a short summary and a team lead reviews every statement before sharing it. There is no measured time-saving baseline. Use these invented updates to design a reversible drafting experiment; do not send anything or connect a real system.',
      expectedOutput: 'One experiment card naming the input, proposed draft output, review owner, baseline to collect, success measure, human approval point and stop condition. Include one unresolved assumption and a decision to test, revise or stop.',
      sampleResponse: 'Example card: use only the three invented weekly updates as input. Produce a three-sentence draft summary with a reference to each original update. The fictional team lead checks every sentence before sharing. First measure current preparation and correction time; no saving is claimed. Success means all three updates are represented accurately and the lead can approve the draft. Stop if the draft invents a fact or misses the Friday decision. Decision: test using fictional inputs; investigate review effort before extending the experiment.',
      durationMinutes: practice,
      agendaSectionIndex: 2,
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
    sources: sources.map(({ id, title }) => ({ id, title })),
    sourceClaims: sources.map(source => ({
      claim: `The selected reference "${source.title}" includes the quoted passage. This scripted fixture checks citation linkage, not workshop suitability.`,
      sourceId: source.id,
      quote: source.content.trim().slice(0, 220),
    })),
  };
  const sourceId = (id: string) => sources.find(source => source.id === id)?.id
    ?? sources[Math.max(0, materials.findIndex(source => source.id === id)) % sources.length].id;
  const references = (ids: string[]) => [...new Set(ids.map(sourceId))];
  pack.agenda.forEach(item => { item.sourceIds = references(item.sourceIds); });
  pack.exercise.sourceIds = references(pack.exercise.sourceIds);
  pack.facilitatorNotes = pack.facilitatorNotes.map(note => note.replace(/\[([^\]]+)\]/g, (_match, id: string) => `[${sourceId(id)}]`));
  if (!usesExampleMaterials(sources)) {
    const notice = 'This scripted fixture does not interpret or derive its workshop content from the supplied documents. Its source references exercise citation wiring only.';
    pack.outcome += ` ${notice}`;
    pack.facilitatorNotes[0] = `${notice} A human must assess whether the fixed synthetic exercise suits the brief. [${sources[0].id}]`;
  }
  if (options?.feedback) pack.outcome += ` Scripted revision request recorded: ${options.feedback} This fixed fixture does not interpret the requested change.`;
  return pack;
}
