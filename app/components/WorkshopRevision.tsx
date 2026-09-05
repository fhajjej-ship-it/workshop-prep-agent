'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, PenLine } from 'lucide-react';
import type { Material, PublicRun, WorkshopPack } from '@/lib/types';
import AgentWork from './AgentWork';
import ClarificationPrompt, { type ClarificationAnswer } from './ClarificationPrompt';
import ContentReview from './ContentReview';
import AnimatedDetails from './AnimatedDetails';
import GeneratedProse from './GeneratedProse';
import WorkshopText, { CitedText } from './WorkshopText';
import MaterialInput, { type MaterialTextDraft } from './MaterialInput';
import { revisionInputRequest, revisionInputSchema, sourceSelectionChanged } from '@/lib/revision-input';

const pendingKey = 'workshop-prep-pending-revision';

async function requestRun(url: string, body?: unknown): Promise<PublicRun> {
  const response = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.run) throw new Error(typeof result?.error === 'string' ? result.error : 'The revision could not be loaded. Please try again.');
  return result.run;
}

export function changedPackSections(original: WorkshopPack, revised: WorkshopPack): string[] {
  const fields: [keyof WorkshopPack, string][] = [['title', 'Title'], ['outcome', 'Workshop goal'], ['agenda', 'Agenda'], ['exercise', 'Exercise'], ['facilitatorNotes', 'Facilitator notes'], ['sources', 'References'], ['sourceClaims', 'Source claims']];
  return fields.filter(([field]) => JSON.stringify(original[field]) !== JSON.stringify(revised[field])).map(([, label]) => label);
}

export function sourceForRevision(original: PublicRun, child: PublicRun | null): PublicRun {
  return child?.status === 'failed' && child.pack ? child : original;
}

export type RevisionPendingState = 'working' | 'awaiting_input' | 'ready' | null;

export function revisionPendingState(child: PublicRun | null, busy: boolean): RevisionPendingState {
  if (busy || child?.status === 'running') return 'working';
  if (child?.status === 'awaiting_input' || child?.status === 'ready') return child.status;
  return null;
}

export function StoppedRevisionDraft({ run, materials, onRead }: {
  run: PublicRun; materials: Material[]; onRead: (material: Material) => void;
}) {
  if (run.status !== 'failed' || !run.pack) return null;
  const pack = run.pack;
  const linkedSection = pack.exercise.agendaSectionIndex === undefined ? undefined : pack.agenda[pack.exercise.agendaSectionIndex];
  function references(ids: string[]) {
    return <div className="source-tags">{ids.map(id => {
      const material = materials.find(source => source.id === id);
      return material ? <button key={id} type="button" className="source-tag" onClick={() => onRead(material)}>{material.title}</button> : <span key={id} className="source-tag">{id}</span>;
    })}</div>;
  }
  return <section className="revision-stopped-draft" aria-label="Stopped revision draft">
    <h4>Stopped draft · Provisional</h4><p>This is the draft your next feedback will revise. It has not completed preparation.</p>
    <p><strong>{run.validation?.valid ? 'Timing and reference checks passed' : run.validation ? 'Timing and reference checks need changes' : 'Timing and reference checks have not finished'}</strong> · {pack.agenda.reduce((total, item) => total + item.minutes, 0)} / {run.brief.durationMinutes} min</p>
    {run.validation && !run.validation.valid && <ul className="validation-issues" aria-label="Timing and reference issues">{run.validation.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
    <AnimatedDetails className="revision-original" defaultOpen summary={<><span>Read the stopped draft</span><span aria-hidden="true">−</span></>}>
      <h4><GeneratedProse text={pack.title} /></h4><p><CitedText text={pack.outcome} materials={materials} onRead={onRead} /></p>
      <h4>Proposed agenda</h4><ol>{pack.agenda.map((item, index) => <li key={index}><strong><GeneratedProse text={item.title} /> · {item.minutes} min</strong><WorkshopText text={item.activity} materials={materials} onRead={onRead} />{references(item.sourceIds)}</li>)}</ol>
      <h4>Proposed exercise: <GeneratedProse text={pack.exercise.title} /></h4>
      {pack.exercise.durationMinutes !== undefined && <p>{pack.exercise.durationMinutes} min{linkedSection ? ` · Agenda: ${linkedSection.title}` : ''}</p>}
      <h4>Participant scenario</h4><WorkshopText text={pack.exercise.scenario || 'No scenario supplied.'} materials={materials} onRead={onRead} />
      <h4>Expected output</h4><WorkshopText text={pack.exercise.expectedOutput || 'No expected output supplied.'} materials={materials} onRead={onRead} />
      <h4>Instructions</h4><ol>{pack.exercise.instructions.map((instruction, index) => <li key={index}><WorkshopText text={instruction} materials={materials} onRead={onRead} /></li>)}</ol>
      <h4>Sample response</h4><div className="exercise-sample"><WorkshopText text={pack.exercise.sampleResponse || 'No sample response supplied.'} materials={materials} onRead={onRead} /></div>
      <h4>Debrief</h4><ul>{pack.exercise.debrief.map((item, index) => <li key={index}><WorkshopText text={item} materials={materials} onRead={onRead} /></li>)}</ul>{references(pack.exercise.sourceIds)}
      <h4>Facilitator notes</h4><ul>{pack.facilitatorNotes.map((note, index) => <li key={index}><WorkshopText text={note} materials={materials} onRead={onRead} /></li>)}</ul>
      <h4>Source claims</h4>{pack.sourceClaims?.length ? pack.sourceClaims.map((claim, index) => <div key={index}><WorkshopText text={claim.claim} materials={materials} onRead={onRead} /><blockquote>{claim.quote}</blockquote>{references([claim.sourceId])}</div>) : <p>No source claims supplied.</p>}
      <h4>References</h4>{references(pack.sources.map(source => source.id))}
    </AnimatedDetails>
  </section>;
}

export function RevisionSummary({ run, original, onOpenPrevious, navigationDisabled = false, openingPrevious = false }: {
  run: PublicRun; original: PublicRun | null;
  onOpenPrevious?: (id: string) => void;
  navigationDisabled?: boolean;
  openingPrevious?: boolean;
}) {
  if (!run.parentRunId) return null;
  if (original?.id !== run.parentRunId) original = null;
  const changed = original?.pack && run.pack ? changedPackSections(original.pack, run.pack) : null;
  return <section className="revision-summary" aria-label="Revision summary"><h3>{run.pack ? 'Revised workshop' : run.status === 'failed' ? 'Revision stopped' : 'Revision in preparation'}</h3><strong>Your requested changes</strong><p>{run.feedback}</p>{changed && <p><strong>{changed.length ? 'Sections changed: ' : 'No section content changed.'}</strong>{changed.join(', ')}{changed.length > 0 ? '.' : ''}</p>}<p className="quiet">{run.pack ? 'Review the updated content to confirm it addresses your feedback.' : run.status === 'failed' ? 'This revision stopped before a draft was saved. You can open the previous version.' : 'This revision has no draft yet. You can open the previous version.'}</p>{onOpenPrevious && <p><button type="button" className="text-button" disabled={navigationDisabled || openingPrevious} onClick={() => onOpenPrevious(run.parentRunId!)}>{openingPrevious ? 'Opening previous version…' : 'Open previous version'}</button></p>}{original?.status === 'completed' && <a className="text-button" href={`/api/runs/${encodeURIComponent(run.parentRunId)}/download?format=pdf`} download>Download previous version PDF</a>}{original?.pack && <AnimatedDetails className="revision-original" summary={<><span>Read the previous version{original.status === 'failed' ? ' · Stopped draft' : ''}</span><span aria-hidden="true">+</span></>}><h4><GeneratedProse text={original.pack.title} /></h4><WorkshopText text={original.pack.outcome} materials={original.materials ?? []} /><ol>{original.pack.agenda.map((item, index) => <li key={index}><strong><GeneratedProse text={item.title} /> · {item.minutes} min</strong><WorkshopText text={item.activity} materials={original.materials ?? []} /></li>)}</ol><h4><GeneratedProse text={original.pack.exercise.title} /></h4>{original.pack.exercise.scenario && <WorkshopText text={original.pack.exercise.scenario} materials={original.materials ?? []} />}{original.pack.exercise.expectedOutput && <WorkshopText text={original.pack.exercise.expectedOutput} materials={original.materials ?? []} />}<ol>{original.pack.exercise.instructions.map((instruction, index) => <li key={index}><WorkshopText text={instruction} materials={original.materials ?? []} /></li>)}</ol>{original.pack.exercise.sampleResponse && <WorkshopText text={original.pack.exercise.sampleResponse} materials={original.materials ?? []} />}<ul>{original.pack.exercise.debrief.map((item, index) => <li key={index}><WorkshopText text={item} materials={original.materials ?? []} /></li>)}</ul><h4>Facilitator notes</h4><ul>{original.pack.facilitatorNotes.map((note, index) => <li key={index}><WorkshopText text={note} materials={original.materials ?? []} /></li>)}</ul></AnimatedDetails>}</section>;
}

export default function WorkshopRevision({ original, examples, ready, onComplete, onStateChange, onRunChange, onRead }: {
  original: PublicRun; examples: Material[]; ready: boolean;
  onComplete: (run: PublicRun, original: PublicRun) => void;
  onStateChange: (state: RevisionPendingState) => void;
  onRunChange?: (run: PublicRun) => void;
  onRead: (material: Material) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>(original.materials ?? examples);
  const [textDraft, setTextDraft] = useState<MaterialTextDraft>({ title: '', content: '' });
  const [materialBusy, setMaterialBusy] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [child, setChild] = useState<PublicRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const questionRef = useRef<HTMLHeadingElement>(null);
  const completedRef = useRef(false);
  const submittingRef = useRef(false);
  const restoredDraftRef = useRef(false);
  const draftKey = `workshop-prep-revision-input-${original.id}`;
  const revisionSourceRef = useRef(original);
  const working = busy || child?.status === 'running';
  const waiting = child?.status === 'awaiting_input';
  const pendingState = revisionPendingState(child, busy || materialBusy);
  const revisionSource = sourceForRevision(original, child);
  const revisingStoppedDraft = revisionSource.status === 'failed' && Boolean(revisionSource.pack);
  const sourcesChanged = sourceSelectionChanged(selectedMaterials, revisionSource.materials ?? examples);
  const unaddedText = Boolean(textDraft.title || textDraft.content);
  const canSubmit = ready && draftLoaded && !working && !waiting && !materialBusy && !unaddedText
    && selectedMaterials.length > 0 && (feedback.trim().length >= 5 || sourcesChanged && !feedback.trim());

  const receive = useCallback((next: PublicRun) => {
    if (next.status === 'completed') {
      if (completedRef.current) return;
      completedRef.current = true;
      try { localStorage.removeItem(pendingKey); localStorage.removeItem(draftKey); } catch { /* Saved runs remain on the server. */ }
      onComplete(next, revisionSourceRef.current);
      return;
    }
    setChild(previous => previous?.id === next.id && previous.version > next.version ? previous : next);
  }, [onComplete, draftKey]);

  useEffect(() => {
    try {
      const saved = revisionInputSchema.safeParse(JSON.parse(localStorage.getItem(draftKey) ?? 'null'));
      if (saved.success) {
        restoredDraftRef.current = true;
        setFeedback(saved.data.feedback); setSelectedMaterials(saved.data.materials); setTextDraft(saved.data.textDraft);
        setSourcesOpen(sourceSelectionChanged(saved.data.materials, original.materials ?? examples) || Boolean(saved.data.textDraft.title || saved.data.textDraft.content));
      }
    } catch { /* Browser storage is optional; the saved workshop is still available. */ }
    setDraftLoaded(true);
  }, [draftKey]); // This editor is keyed to the original saved version.

  useEffect(() => {
    if (!draftLoaded || completedRef.current) return;
    try {
      if (feedback || textDraft.title || textDraft.content || sourceSelectionChanged(selectedMaterials, original.materials ?? examples)) {
        localStorage.setItem(draftKey, JSON.stringify({ feedback, materials: selectedMaterials, textDraft }));
      } else localStorage.removeItem(draftKey);
    } catch { /* Keep unsaved edits in the visible editor if storage is unavailable. */ }
  }, [draftLoaded, draftKey, feedback, selectedMaterials, textDraft, original.materials, examples]);

  useEffect(() => { onStateChange(pendingState); return () => onStateChange(null); }, [pendingState, onStateChange]);
  useEffect(() => { if (child) onRunChange?.(child); }, [child, onRunChange]);

  useEffect(() => {
    let active = true;
    let pending: { id?: string; originalId?: string; parentId?: string } | null = null;
    try { pending = JSON.parse(localStorage.getItem(pendingKey) ?? 'null'); } catch { /* Browser storage is optional. */ }
    if ((pending?.originalId ?? pending?.parentId) === original.id && pending?.id) {
      setBusy(true);
      void requestRun(`/api/runs/${encodeURIComponent(pending.id)}`).then(async next => {
        if (!active) return;
        if (!next.parentRunId) throw new Error('The saved revision has no parent.');
        const source = next.parentRunId === original.id ? original : await requestRun(`/api/runs/${encodeURIComponent(next.parentRunId)}`);
        if (!active) return;
        revisionSourceRef.current = source;
        if (!restoredDraftRef.current) {
          setFeedback(next.feedback ?? '');
          setSelectedMaterials(next.materials ?? source.materials ?? examples);
          setSourcesOpen(sourceSelectionChanged(next.materials ?? examples, source.materials ?? examples));
        }
        receive(next);
      }).catch(() => { if (active) setError('The previous revision could not be restored. Your original workshop is still available.'); })
        .finally(() => { if (active) setBusy(false); });
    }
    return () => { active = false; };
  }, [original.id, receive]);

  useEffect(() => {
    if (!working || !child?.id) return;
    let active = true;
    const id = child.id;
    const timer = setInterval(() => { void requestRun(`/api/runs/${encodeURIComponent(id)}`).then(next => { if (active) receive(next); }).catch(() => { /* The request reports actionable errors. */ }); }, 850);
    return () => { active = false; clearInterval(timer); };
  }, [working, child?.id, receive]);

  useEffect(() => {
    if (!waiting || busy) return;
    questionRef.current?.focus({ preventScroll: true });
    questionRef.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [waiting, busy, child?.clarification?.question]);

  async function advanceRevision(id: string, answer: ClarificationAnswer = {}) {
    try { receive(await requestRun(`/api/runs/${encodeURIComponent(id)}/advance`, answer)); }
    catch (requestError) {
      try { receive(await requestRun(`/api/runs/${encodeURIComponent(id)}`)); } catch { /* Keep the saved original visible. */ }
      throw requestError;
    }
  }

  async function startRevision() {
    if (!canSubmit || submittingRef.current) return;
    let input;
    try { input = revisionInputRequest({ feedback, materials: selectedMaterials, textDraft }, revisionSource.materials ?? examples); }
    catch (inputError) { setError(inputError instanceof Error ? inputError.message : 'Check the selected materials before rerunning.'); return; }
    submittingRef.current = true;
    setBusy(true); setError(null); completedRef.current = false;
    revisionSourceRef.current = revisionSource;
    try {
      const next = await requestRun(`/api/runs/${encodeURIComponent(revisionSource.id)}/revise`, input);
      setChild(next);
      try { localStorage.setItem(pendingKey, JSON.stringify({ id: next.id, originalId: original.id, parentId: revisionSource.id })); } catch { /* The original and revision remain saved on the server. */ }
      await advanceRevision(next.id);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'The revision could not finish. Your original is preserved.'); }
    finally { submittingRef.current = false; setBusy(false); }
  }

  async function continueRevision(answer: ClarificationAnswer = {}) {
    if (!child || working) return;
    setBusy(true); setError(null);
    try { await advanceRevision(child.id, answer); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'The revision could not continue.'); }
    finally { setBusy(false); }
  }

  return <section className="workshop-revision" aria-labelledby={`${inputId}-heading`}>
    <h2 id={`${inputId}-heading`}><PenLine size={18} aria-hidden="true" />Improve this workshop</h2>
    <p>Request changes or update the sources, then rerun preparation. This workshop keeps one card, with earlier versions available.</p>
    {(!child || child.status === 'failed') && <div className="revision-feedback">
      <label htmlFor={inputId}>{revisingStoppedDraft ? 'What should change in this stopped draft?' : 'What should change?'}</label>
      {child?.status === 'failed' && child.pack && <p>This feedback will revise the stopped draft below. Your original workshop stays unchanged.</p>}
      <textarea id={inputId} rows={3} maxLength={2000} value={feedback} onChange={event => setFeedback(event.target.value)} disabled={working || materialBusy} placeholder="e.g. Keep the agenda, but give participants a more concrete scenario. Optional when you change the selected sources." />
      <button type="button" className="text-button revision-sources-toggle" aria-expanded={sourcesOpen} aria-controls={`${inputId}-sources`} disabled={working || materialBusy} onClick={() => setSourcesOpen(!sourcesOpen)}>{sourcesOpen ? 'Hide source editor' : 'Add or change sources'} · {selectedMaterials.length} selected{sourcesChanged ? ' · Updated' : ''}</button>
      {sourcesOpen && <div id={`${inputId}-sources`}><MaterialInput examples={examples} selected={selectedMaterials} textDraft={textDraft} disabled={Boolean(working)} replaceExamplesOnAdd={false} preparationLabel="Rerun workshop" onChange={setSelectedMaterials} onTextDraftChange={setTextDraft} onRead={onRead} onBusyChange={setMaterialBusy} /></div>}
      {sourcesChanged && <p className="material-input-help">The new version will use only these selected sources and check the updated content again. Earlier versions keep their original sources.</p>}
      {unaddedText && !sourcesOpen && <p className="material-pending-note">Open the source editor to add or discard your pasted text before rerunning.</p>}
      {selectedMaterials.length === 0 && !sourcesOpen && <p className="material-pending-note">Add at least one source before rerunning.</p>}
      <button type="button" className="primary-button" disabled={!canSubmit} onClick={() => void startRevision()}>{working ? 'Preparing revision…' : sourcesChanged ? 'Rerun workshop' : revisingStoppedDraft ? 'Revise stopped draft' : 'Revise workshop'}<ArrowRight size={15} aria-hidden="true" /></button>
    </div>}
    {error && <p className="material-error" role="alert">{error}</p>}
    {child && <div className="revision-progress"><h3>{child.status === 'failed' ? 'Revision stopped' : 'Revising a separate version'}</h3><p>Your original workshop remains above.</p><AgentWork run={child} starting={false} busy={busy} inProgress={Boolean(working)} materials={child.materials ?? original.materials ?? examples} onRead={onRead}>
      <ClarificationPrompt key={child.id} run={child} busy={busy} headingRef={questionRef} onContinue={answer => void continueRevision(answer)} />
      {child.status === 'ready' && !working && <button type="button" className="primary-button" disabled={!ready} onClick={() => void continueRevision()}>Resume revision<ArrowRight size={14} aria-hidden="true" /></button>}
    </AgentWork>{child.contentReview && <ContentReview run={child} />}{child.status === 'failed' && <p className="material-error" role="alert">{child.error ?? 'This revision did not finish.'} The original workshop is unchanged.</p>}<StoppedRevisionDraft run={child} materials={child.materials ?? original.materials ?? examples} onRead={onRead} /></div>}
  </section>;
}
