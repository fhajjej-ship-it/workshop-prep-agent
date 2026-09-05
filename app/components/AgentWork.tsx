import { BookOpen, CircleCheck, CircleDot, LoaderCircle, Plus, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PublicRun, ToolEvent } from '@/lib/types';
import AnimatedDetails from './AnimatedDetails';

type Material = { id: string; title: string; content: string };
type Outcome = { title: string; detail?: string; sourceId?: string; tone: 'neutral' | 'success' | 'warning' };
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

export function describeOutcome(event: ToolEvent, duration: number): Outcome {
  const input = record(event.input);
  const output = record(event.output);
  if (event.status === 'error') return { title: `${event.tool.replace(/_/g, ' ')} did not finish`, detail: typeof output.error === 'string' ? output.error : 'See the saved tool details.', tone: 'warning' };
  if (event.tool === 'read_material') return { title: `Read: ${typeof output.title === 'string' ? output.title : 'supplied material'}`, sourceId: typeof output.id === 'string' ? output.id : typeof input.id === 'string' ? input.id : undefined, tone: 'neutral' };
  if (event.tool === 'search_materials') return { title: 'Searched the supplied materials', detail: Array.isArray(output.matches) ? `${output.matches.length} matching references returned.` : undefined, tone: 'neutral' };
  if (event.tool === 'draft_pack') {
    const pack = record(input.pack);
    const agenda = Array.isArray(pack.agenda) ? pack.agenda : [];
    const minutes = agenda.reduce((sum, item) => sum + (typeof record(item).minutes === 'number' ? record(item).minutes as number : 0), 0);
    return { title: `Draft ${typeof output.revision === 'number' ? output.revision : ''} available`.replace('  ', ' '), detail: agenda.length ? `${minutes}-minute agenda, exercise and facilitator notes returned. Check results follow separately.` : 'The returned pack is available for inspection.', tone: 'neutral' };
  }
  if (event.tool === 'validate_pack') {
    const issues = Array.isArray(output.issues) ? output.issues.filter((issue): issue is string => typeof issue === 'string') : [];
    return output.valid === true
      ? { title: 'Timing and reference checks passed', detail: typeof output.totalMinutes === 'number' ? `${output.totalMinutes} / ${duration} minutes. Human review is still required.` : 'Human review is still required.', tone: 'success' }
      : { title: 'Correction needed', detail: issues.join(' ') || 'The draft has not passed its checks.', tone: 'warning' };
  }
  if (event.tool === 'save_for_review') return { title: `Draft ${typeof output.revision === 'number' ? output.revision : ''} saved for review`.replace('  ', ' '), detail: 'The pack is ready for your review and download.', tone: 'success' };
  if (event.tool === 'review_content') return { title: `${output.mode === 'scripted' ? 'Scripted' : 'AI-assisted'} content review ${output.status === 'passed' ? 'complete' : 'found issues'}`, detail: output.status === 'passed' ? 'No issues flagged by this review. Human review is still required.' : Array.isArray(output.issues) ? `${output.issues.length} issue${output.issues.length === 1 ? '' : 's'} recorded for revision.` : 'Review the saved feedback.', tone: output.status === 'passed' ? 'success' : 'warning' };
  if (event.tool === 'ask_missing_info') return { title: 'Workshop format requested', detail: typeof output.question === 'string' ? output.question : undefined, tone: 'neutral' };
  if (event.tool === 'ask_clarification') return { title: 'Workshop detail requested', detail: typeof output.question === 'string' ? output.question : undefined, tone: 'neutral' };
  return { title: `${event.tool.replace(/_/g, ' ')} completed`, tone: 'neutral' };
}

export function describeCurrentAction(run: PublicRun | null, starting: boolean, resuming = false): string {
  if (starting) return 'Starting a new preparation';
  if (!run) return 'Waiting for the first update';
  if (run.status === 'awaiting_input') return resuming ? 'Sending your answer' : 'Your answer is needed';
  if (run.status === 'completed') return 'Preparation finished';
  if (run.status === 'failed') return 'Preparation stopped';
  if (run.status === 'ready') return resuming ? 'Starting the agent' : 'Ready to resume';
  if (run.currentAction?.phase === 'review') return 'Reviewing goal fit, source claims and exercise completeness';
  if (run.currentAction?.phase === 'model') {
    if (run.contentReview?.status === 'needs_revision' && run.contentReview.reviewedRevision === run.revision) return `Content review found issues in draft ${run.revision}. A revision is pending`;
    if (run.validation?.valid && (run.workflowVersion !== 2 || run.contentReview?.status === 'passed' && run.contentReview.reviewedRevision === run.revision)) return 'Checks passed. Waiting for the saved pack';
    if (run.validation?.valid) return 'Timing checks passed. Content review is pending';
    if (run.validation) return `Draft ${run.revision} needs changes. A revised draft is pending`;
    if (run.pack) return `Draft ${run.revision} returned. Checks are pending`;
    if (run.readSourceIds.length) return `${run.readSourceIds.length} reference${run.readSourceIds.length === 1 ? '' : 's'} read. The first draft is pending`;
    return 'Waiting for the first preparation action';
  }
  if (run.currentAction?.phase === 'tool') return ({
    search_materials: 'Searching the supplied materials',
    read_material: 'Reading a supplied reference',
    draft_pack: 'Recording the returned draft',
    validate_pack: 'Checking the draft’s timing and references',
    review_content: 'Reviewing goal fit, source claims and exercise completeness',
    save_for_review: 'Saving the checked pack for your review',
    ask_missing_info: 'Preparing a question for you',
    ask_clarification: 'Preparing one question to tailor the workshop',
  } as Record<string, string>)[run.currentAction.tool ?? ''] ?? 'Running a preparation action';
  return 'Waiting for the next preparation update';
}

export function getPreparationStages(run: PublicRun | null) {
  const referenceCount = run?.readSourceIds.length ?? 0;
  const current = run?.status === 'running' ? run.currentAction : null;
  const currentTool = current?.phase === 'tool' ? current.tool : undefined;
  const reading = currentTool === 'search_materials' || currentTool === 'read_material';
  const asking = currentTool === 'ask_missing_info' || currentTool === 'ask_clarification';
  const contentPassed = run?.contentReview?.status === 'passed' && run.contentReview.reviewedRevision === run.revision;
  const checksPassed = run?.validation?.valid === true && (run.workflowVersion !== 2 || contentPassed);
  const stages = [
    { title: 'Confirm the brief', done: Boolean(run?.brief.format) && run?.status !== 'awaiting_input' && !asking, detail: run?.status === 'awaiting_input' ? 'Your answer is needed' : run?.brief.format ? 'Audience, goal and format supplied' : 'Confirm who, why, how and how long' },
    { title: 'Review references', done: Boolean(run?.pack) && !reading, detail: `${referenceCount} reference${referenceCount === 1 ? '' : 's'} read` },
    { title: 'Build the pack', done: Boolean(run?.pack), detail: run?.pack ? `Draft ${run.revision} returned` : 'Agenda, exercise, notes and sources' },
    { title: 'Check and improve', done: checksPassed, detail: run?.workflowVersion === 2 ? checksPassed ? 'Timing checks and content review complete' : run.contentReview?.status === 'needs_revision' && run.contentReview.reviewedRevision === run.revision ? `${run.contentReview.issues.length} content issue${run.contentReview.issues.length === 1 ? '' : 's'} to address` : 'Timing checks and a separate content review' : run?.validation ? run.validation.valid ? 'Timing and reference checks passed' : `${run.validation.issues.length} issue${run.validation.issues.length === 1 ? '' : 's'} to address` : 'Check the draft and revise if needed' },
    { title: 'Save for review', done: run?.status === 'completed', detail: run?.status === 'completed' ? 'Saved for your review' : 'Hand over the checked pack' },
  ];
  let currentStage = stages.findIndex(stage => !stage.done);
  if (run?.status === 'completed') currentStage = -1;
  else if (run?.status === 'awaiting_input') currentStage = 0;
  else if (current?.phase === 'review') currentStage = 3;
  else if (reading) currentStage = 1;
  else if (currentTool === 'draft_pack') currentStage = run?.pack ? 3 : 2;
  else if (currentTool === 'validate_pack' || currentTool === 'review_content') currentStage = 3;
  else if (currentTool === 'save_for_review') currentStage = 4;
  else if (currentTool === 'ask_missing_info' || currentTool === 'ask_clarification') currentStage = 0;
  return { stages, currentStage };
}

export default function AgentWork({ run, starting, busy, materials, onRead, children, history = false, inProgress = false }: {
  run: PublicRun | null; starting: boolean; busy: boolean; materials: Material[];
  onRead: (material: Material) => void; children?: ReactNode; history?: boolean; inProgress?: boolean;
}) {
  const visibleRun = starting ? null : run;
  const events = visibleRun?.events ?? [];
  const recent = events.slice(-3);
  const earlier = events.slice(0, -3);
  const readMaterials = materials.filter(material => visibleRun?.readSourceIds?.includes(material.id));
  const current = visibleRun?.status === 'running' ? visibleRun.currentAction : null;
  const activeMaterial = current?.phase === 'tool' && current.tool === 'read_material' ? materials.find(material => material.id === current.sourceId) : undefined;
  const needsAnswer = visibleRun?.status === 'awaiting_input' && !busy;
  const stopped = visibleRun?.status === 'failed';
  const showSpinner = inProgress && !stopped && visibleRun?.status !== 'completed';
  const { stages, currentStage } = getPreparationStages(visibleRun);
  function sourceButton(material: Material, className = 'work-source') {
    return <button type="button" className={className} data-source-id={material.id} aria-label={`Read source: ${material.title}`} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }}><BookOpen size={14} aria-hidden="true" />{material.title}</button>;
  }
  function outcome(event: ToolEvent, latestResult = false) {
    const summary = describeOutcome(event, visibleRun?.brief.durationMinutes ?? 0);
    const material = materials.find(item => item.id === summary.sourceId);
    const Icon = summary.tone === 'warning' ? TriangleAlert : summary.tone === 'success' ? CircleCheck : CircleDot;
    return <div key={event.id} className={`work-outcome ${summary.tone} ${latestResult ? 'latest-outcome' : ''}`}>
      <Icon size={15} aria-hidden="true" /><div>{latestResult && <span className="work-label">Latest completed action</span>}<p className="work-outcome-title">{material ? <>Read {sourceButton(material, 'work-source work-result-source')}</> : summary.title}</p>{summary.detail && <p className="work-outcome-detail">{summary.detail}</p>}</div><time dateTime={event.at}>{new Date(event.at) .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
    </div>;
  }
  return <div className={`agent-work ${history ? 'work-history' : ''}`}>
    <ol className="work-stages" aria-label="Workshop preparation steps">{stages.map((stage, index) => <li key={stage.title} data-state={stage.done ? 'done' : index === currentStage ? stopped ? 'stopped' : 'current' : 'pending'} aria-current={index === currentStage && !history ? 'step' : undefined}>
      <span className="work-stage-marker" aria-hidden="true">{stage.done ? <CircleCheck size={18} /> : index + 1}</span><div><span className="work-stage-title">{stage.title}</span><span className="work-stage-detail">{stage.detail}</span></div>
    </li>)}</ol>
    {!history && <div className={`work-now ${needsAnswer ? 'answer-needed' : ''}`}>
      {!needsAnswer && <><span className="work-label">{stopped ? 'Preparation stopped' : 'Working toward'}</span><h3 className="work-phase-heading">{showSpinner && <LoaderCircle className="work-spinner" size={18} aria-hidden="true" />}<span>{stages[currentStage]?.title ?? 'Your workshop is ready for review'}</span></h3><p className="work-current-action">{describeCurrentAction(visibleRun, starting, busy)}</p><span className="work-input-state">{stopped ? 'No action is running' : visibleRun?.status === 'ready' && !busy ? 'Resume when you are ready' : 'No input needed'}</span></>}
      {activeMaterial && <div className="work-active-material">{sourceButton(activeMaterial)}</div>}
      {current?.startedAt && <p className="work-started">Started <time dateTime={current.startedAt}>{new Date(current.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></p>}
      {children}
    </div>}
    {history ? events.length > 0 ? <div className="work-history-events">{events.map(event => outcome(event))}</div> : <p className="work-empty">No preparation actions were recorded.</p> : recent.length > 0 && !needsAnswer ? <div className="work-results"><span className="work-label">Work so far · {events.length} recorded actions</span>{earlier.length > 0 && <AnimatedDetails className="work-earlier" summary={<><span>Earlier steps · {earlier.length}</span><Plus size={14} aria-hidden="true" /></>}>{earlier.map(event => outcome(event))}</AnimatedDetails>}<div className="work-recent">{recent.map(event => outcome(event))}</div></div> : !needsAnswer && <p className="work-empty">Recorded steps will appear here as the agent works.</p>}
    {readMaterials.length > 0 && <AnimatedDetails className="work-references" summary={<><span><BookOpen size={14} aria-hidden="true" />References read · {readMaterials.length}</span><Plus size={14} aria-hidden="true" /></>}><div className="work-read-materials"><div>{readMaterials.map(material => <span key={material.id}>{sourceButton(material)}</span>)}</div></div></AnimatedDetails>}
  </div>;
}
