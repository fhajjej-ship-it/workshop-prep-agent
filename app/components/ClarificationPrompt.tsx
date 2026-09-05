'use client';

import { useId, useState, type RefObject } from 'react';
import { ArrowRight, CircleHelp } from 'lucide-react';
import type { Brief, PublicRun } from '@/lib/types';

export type ClarificationAnswer = { format?: Exclude<Brief['format'], ''>; answer?: string };
const formats = { 'in-person': 'In person', remote: 'Remote', hybrid: 'Hybrid' } as const;

export type ClarificationDraft = {
  runId: string; question: PublicRun['clarification']; value: ClarificationAnswer;
};

export function clarificationDraftForRun(previous: ClarificationDraft | null, run: PublicRun): ClarificationDraft {
  if (!previous || previous.runId !== run.id) return { runId: run.id, question: run.clarification, value: {} };
  if (run.clarification && (run.clarification.key !== previous.question?.key || run.clarification.question !== previous.question?.question)) {
    return { runId: run.id, question: run.clarification, value: {} };
  }
  return previous;
}

type PromptProps = {
  run: PublicRun; busy: boolean; onContinue: (answer: ClarificationAnswer) => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
};

export default function ClarificationPrompt(props: PromptProps) {
  const [savedDraft, setDraft] = useState(() => clarificationDraftForRun(null, props.run));
  const draft = clarificationDraftForRun(savedDraft, props.run);
  if (draft !== savedDraft) setDraft(draft);
  return <ClarificationForm {...props} draft={draft} onChange={value => setDraft({ ...draft, value })} />;
}

export function ClarificationForm({ run, busy, onContinue, headingRef, draft, onChange }: PromptProps & {
  draft: ClarificationDraft; onChange: (value: ClarificationAnswer) => void;
}) {
  const inputId = useId();
  if (!draft.question || (run.status !== 'awaiting_input' && !busy)) return null;
  const { format, answer = '' } = draft.value;
  const detail = draft.question.key === 'detail';
  const ready = detail ? Boolean(answer.trim()) : Boolean(format);
  return <div className="clarification">
    <div className="clarification-top"><span className="question-icon" aria-hidden="true"><CircleHelp size={14} /></span><div><span className="eyebrow">Your input</span><h3 ref={headingRef} tabIndex={-1}>{draft.question.question}</h3></div></div>
    {detail ? <><p>One detail will help the agent tailor this workshop. Your answer is saved when you continue.</p><label className="sr-only" htmlFor={inputId}>Your answer</label><textarea id={inputId} className="clarification-answer" rows={3} maxLength={1200} value={answer} onChange={event => onChange({ answer: event.target.value })} disabled={busy} placeholder="Add the detail you want the workshop to follow." /></> : <><p>The format changes how participants collaborate. Choose one to continue.</p><div className="format-options" role="group" aria-label="Workshop format">{Object.entries(formats).map(([value, label]) => <button type="button" key={value} aria-pressed={format === value} disabled={busy} onClick={() => onChange({ format: value as Exclude<Brief['format'], ''> })} className={format === value ? 'selected' : ''}>{label}</button>)}</div></>}
    <button type="button" className="primary-button continue-button" disabled={!ready || busy} onClick={() => onContinue(detail ? { answer: answer.trim() } : { format: format! })}>{busy ? 'Continuing preparation…' : 'Continue preparation'}<ArrowRight size={14} aria-hidden="true" /></button><span className="saved-note">Progress saved. You can return to this question.</span>
  </div>;
}
