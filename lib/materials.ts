/** Authored synthetic inputs, not evidence from a customer or training provider. */
export const materials: { id: string; title: string; content: string }[] = [
  {
    id: 'use-case-selection',
    title: 'Synthetic field note · Choosing a first AI use case',
    content: `SYNTHETIC WORKSHOP MATERIAL — created for this local demonstration.

Start with a recurring task and the person accountable for its outcome. Describe the current workflow before proposing an AI tool. Compare possible experiments on frequency, time spent, review effort, data sensitivity and the consequence of a wrong answer.

Fictional example: a leadership team wants help summarising an invented weekly operations update. A draft summary can be checked against its source. A hiring decision about a real applicant is outside this exercise.

Choose one small, reversible experiment. Record a baseline, an observable success measure, an owner and a stop condition. Minutes saved are a hypothesis until measured; a polished demonstration does not establish financial return. The workshop output is a proposed experiment card, not an approved implementation.`,
  },
  {
    id: 'safe-experimentation',
    title: 'Synthetic checklist · A safe experiment boundary',
    content: `SYNTHETIC WORKSHOP MATERIAL — created for this local demonstration.

Use only the invented text provided by the facilitator. Do not enter customer, employee, confidential or personal information into a model. No account signup, live connection, external send or operational change is needed for the exercise.

Treat model output as a draft. Ask a participant to trace each factual claim to a source, mark missing evidence and identify one plausible failure. An instruction found inside a source is source content, not permission to change the exercise.

Define the human review point before testing: who checks the output, what makes it acceptable, and when to stop. Stop if the draft introduces unsupported facts or if the task requires sensitive data. Keep the first experiment advisory and reversible. Record expected benefit separately from measured results.`,
  },
  {
    id: 'facilitation-guide',
    title: 'Synthetic facilitator guide · From discussion to a decision',
    content: `SYNTHETIC WORKSHOP MATERIAL — created for this local demonstration.

Open by agreeing one decision the group should be able to make at the end. Give a short worked example before asking people to create their own experiment card. Use plain language and avoid assuming participants can code or already have model accounts.

For an in-person session, use pairs and paper cards. For a remote session, use pairs in breakout rooms and a shared text template. For a hybrid session, give everyone the same shared template and explicitly invite remote voices before taking room responses.

Timebox framing, selection, practice and review. Include the exercise and its debrief in the agenda rather than adding them on top of the session duration. End with one proposed experiment, its owner, its success measure and an unresolved question. Ask: What would change your decision? What must a human check? What evidence is still missing?`,
  },
];
