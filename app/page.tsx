'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CircleCheck, CircleDot, CircleHelp, Download, FileText, FlaskConical, ListChecks, Minus, PenLine, Plus, TriangleAlert, Workflow } from 'lucide-react';
import type { AppConfig, Brief, PublicRun, ToolEvent, WorkshopPack } from '@/lib/types';
import AnimatedDetails from './components/AnimatedDetails';
import MaterialReader from './components/MaterialReader';
import AgentWork, { describeCurrentAction, describeOutcome } from './components/AgentWork';

type Material = { id: string; title: string; content: string };
type PackTab = 'agenda' | 'exercise' | 'notes' | 'sources';
const storageKey = 'workshop-prep-current-run';
const initialBrief: Brief = {
  audience: '12 senior leaders, new to practical AI adoption',
  objective: 'Choose one valuable AI use case and define a safe first experiment.',
  durationMinutes: 90,
  constraints: 'Use plain language. No real customer data. Include hands-on discussion and a clear next step.',
  format: '',
};
const formatNames: Record<Exclude<Brief['format'], ''>, string> = {
  'in-person': 'In person', remote: 'Remote', hybrid: 'Hybrid',
};

function Arrow({ small = false }: { small?: boolean }) {
  return <ArrowRight size={small ? 14 : 18} aria-hidden="true" />;
}

function DownloadIcon() {
  return <Download size={15} aria-hidden="true" />;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : `Request failed (${response.status}). Please try again.`);
  if (!result) throw new Error('The server returned an empty response. Please try again.');
  return result as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2) ?? 'No value returned';
}

function eventDescription(event: ToolEvent) {
  const output = typeof event.output === 'object' && event.output !== null ? event.output as Record<string, unknown> : {};
  if (event.status === 'error') return { tone: 'warning', label: 'Tool error' };
  if (output.valid === false) return { tone: 'warning', label: 'Feedback · revision needed' };
  if (output.valid === true) return { tone: 'success', label: 'Validation passed' };
  return { tone: 'neutral', label: 'Tool completed' };
}

function Activity({ run, busy }: { run: PublicRun; busy: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = expanded ? run.events : run.events.slice(-3);
  return <section className="activity-panel" aria-labelledby="activity-heading">
    <div className="section-heading activity-heading">
      <div><span className="eyebrow">The working record</span><h2 id="activity-heading">Tool activity <span className="count">{run.events.length}</span></h2></div>
      <span className={`status-pill ${busy ? 'active' : ''}`}><span className="status-dot" />{busy ? 'Request in progress' : 'Saved activity'}</span>
    </div>
    {run.events.length === 0 ? <p className="quiet activity-empty">Tool results will appear here as the run progresses.</p> : <ol className="event-list">
      {visibleEvents.map((event) => {
        const description = eventDescription(event);
        const EventIcon = description.tone === 'warning' ? TriangleAlert : description.tone === 'success' ? CircleCheck : event.tool === 'read_material' ? BookOpen : event.tool === 'draft_pack' ? PenLine : event.tool === 'validate_pack' ? ListChecks : event.tool === 'save_for_review' ? FileText : Workflow;
        return <li key={event.id} className={busy ? 'activity-arrival' : undefined}><AnimatedDetails className={`event ${description.tone}`} summary={<><span className="event-icon" aria-hidden="true"><EventIcon size={14} /></span><span className="event-copy"><span className="event-title">{event.tool.replace(/_/g, ' ')}</span><span className="event-description">{description.label}</span></span><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span className="expand-mark" aria-hidden="true"><Plus size={14} /></span></>}>
          <div className="event-detail"><span className="code-label">Input</span><pre>{pretty(event.input)}</pre><span className="code-label">Result</span><pre>{pretty(event.output)}</pre></div>
        </AnimatedDetails></li>;
      })}
    </ol>}
    {run.events.length > 3 && <button type="button" className="text-button activity-toggle" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show recent activity' : `View all ${run.events.length} tool calls`} <span aria-hidden="true">{expanded ? <Minus size={12} /> : <Plus size={12} />}</span></button>}
    <p className="activity-footnote">Actual tool inputs and results.{run.mode === 'test' ? ' Planning decisions are scripted in test mode.' : ' Planning decisions use the configured model.'}</p>
  </section>;
}

type SourceActions = { materials: Material[]; onRead: (material: Material) => void };

function Sources({ ids, materials, onRead }: { ids: string[] } & SourceActions) {
  return <span className="source-tags">{ids.map(id => {
    const material = materials.find(item => item.id === id);
    return material ? <button type="button" key={id} className="source-tag source-link" data-source-id={id} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }} aria-label={`Read source: ${material.title}`}>{id}</button> : <span key={id} className="source-tag" data-source-id={id}>{id}</span>;
  })}</span>;
}

function CitedText({ text, materials, onRead }: { text: string } & SourceActions) {
  return <>{text.split(/(\[[^\]]+\])/g).map((part, index) => {
    const material = part.startsWith('[') ? materials.find(item => item.id === part.slice(1, -1)) : undefined;
    return material ? <button type="button" key={index} className="source-tag source-link" data-source-id={material.id} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }} aria-label={`Read source: ${material.title}`}>{part}</button> : part;
  })}</>;
}

function PackContent({ pack, tab, run, materials, onRead }: { pack: WorkshopPack; tab: PackTab; run: PublicRun } & SourceActions) {
  if (tab === 'exercise') return <div className="pack-section"><div className="content-heading"><span className="eyebrow">Make it practical</span><h3>{pack.exercise.title}</h3><Sources ids={pack.exercise.sourceIds} materials={materials} onRead={onRead} /></div><h4>Instructions</h4><ol className="instruction-list">{pack.exercise.instructions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol><div className="debrief"><h4>Bring the room back together</h4><ul>{pack.exercise.debrief.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div></div>;
  if (tab === 'notes') return <div className="pack-section"><div className="content-heading"><span className="eyebrow">Before you lead</span><h3>Facilitator notes</h3></div><ul className="notes-list">{pack.facilitatorNotes.map((note, index) => <li key={`${index}-${note}`}><span className="note-index">{String(index + 1).padStart(2, '0')}</span><p><CitedText text={note} materials={materials} onRead={onRead} /></p></li>)}</ul></div>;
  if (tab === 'sources') return <div className="pack-section"><div className="content-heading"><span className="eyebrow">Keep the context close</span><h3>Sources used in this pack</h3><p className="quiet">Open a reference to read the fixed demo material behind this pack.</p></div><ul className="source-list">{pack.sources.map(source => {
    const material = materials.find(item => item.id === source.id);
    return <li key={source.id} data-source-id={source.id}><span className="source-document" aria-hidden="true"><FileText size={16} /></span><div><Sources ids={[source.id]} materials={materials} onRead={onRead} /><h4>{material ? <button type="button" className="source-title-link" onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }}>{source.title}<Arrow small /></button> : source.title}</h4></div></li>;
  })}</ul></div>;
  let elapsed = 0;
  const schedule = pack.agenda.map(item => {
    const start = elapsed;
    elapsed += item.minutes;
    return { ...item, start, end: elapsed };
  });
  const minute = (value: number) => String(value).padStart(2, '0');
  return <div className="pack-section agenda-section">
    <div className="agenda-overview"><span className="eyebrow">The shape of the session</span><span>{elapsed} minutes · {run.brief.format ? formatNames[run.brief.format] : 'Format to confirm'}</span></div>
    <div className="agenda-strip" role="list" aria-label="Workshop timeline">
      {schedule.map((item, index) => <div key={`${index}-${item.title}`} role="listitem" className={`agenda-segment segment-${index % 5}`} style={{ flexGrow: Math.max(1, item.minutes), animationDelay: `${index * 750}ms` }} title={`${item.title}: ${item.minutes} minutes · ${minute(item.start)}–${minute(item.end)} elapsed minutes`} aria-label={`${item.title}, ${item.minutes} minutes, ${minute(item.start)} to ${minute(item.end)} elapsed minutes`}>
        <span aria-hidden="true">{minute(index + 1)}</span>
        <strong aria-hidden="true">{item.minutes}<small>m</small></strong>
      </div>)}
    </div>
    <ol className="agenda-list">{schedule.map((item, index) => <li key={`${index}-${item.title}`}>
      <div className="agenda-time"><strong>{minute(item.start)}—{minute(item.end)}</strong><span>minutes</span></div>
      <div className="agenda-item"><h3><span className={`agenda-marker segment-${index % 5}`} />{item.title}</h3><p>{item.activity}</p><Sources ids={item.sourceIds} materials={materials} onRead={onRead} /></div>
    </li>)}</ol>
  </div>;

}

export default function Home() {
  const [brief, setBrief] = useState<Brief>(initialBrief);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [run, setRun] = useState<PublicRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Exclude<Brief['format'], ''> | null>(null);
  const [tab, setTab] = useState<PackTab>('agenda');
  const [editingBrief, setEditingBrief] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const runRef = useRef<PublicRun | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const briefHeadingRef = useRef<HTMLHeadingElement>(null);
  const handoffRef = useRef('');
  const acceptRun = useCallback((next: PublicRun) => {
    if (runRef.current?.id === next.id && runRef.current.version > next.version) return;
    runRef.current = next;
    setRun(next);
    try { localStorage.setItem(storageKey, next.id); } catch { /* The server still persists the run if browser storage is unavailable. */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [configuration, sourceData] = await Promise.all([api<AppConfig>('/api/config'), api<{ materials: Material[] }>('/api/materials')]);
        if (cancelled) return;
        setConfig(configuration);
        setMaterials(sourceData.materials);
        let savedId: string | null = null;
        try { savedId = localStorage.getItem(storageKey); } catch { /* Browser storage is optional. */ }
        if (savedId) {
          try {
            const data = await api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(savedId)}`);
            if (!cancelled) { acceptRun(data.run); setBrief(data.run.brief); }
          } catch (restoreError) {
            if (!cancelled) setError(`The previous run could not be restored. ${errorMessage(restoreError)}`);
          }
        }
      } catch (loadError) { if (!cancelled) setError(errorMessage(loadError)); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [acceptRun]);

  useEffect(() => {
    if ((!busy && run?.status !== 'running') || !run?.id) return;
    const id = run.id;
    let active = true;
    const timer = setInterval(() => {
      void api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(id)}`).then(data => { if (active) acceptRun(data.run); }).catch(() => { /* The active request reports actionable failures. */ });
    }, 850);
    return () => { active = false; clearInterval(timer); };
  }, [busy, run?.id, run?.status, acceptRun]);

  async function advance(id: string, format?: Exclude<Brief['format'], ''>) {
    const data = await api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(id)}/advance`, { method: 'POST', body: JSON.stringify(format ? { format } : {}) });
    acceptRun(data.run);
    setBrief(data.run.brief);
    setConfig(await api<AppConfig>('/api/config'));
    if (data.run.status === 'failed') setError(data.run.error || 'Preparation stopped. Review the tool activity below.');
  }

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setAnswer(null); setTab('agenda');
    requestAnimationFrame(() => {
      resultHeadingRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
    try {
      const data = await api<{ run: PublicRun }>('/api/runs', { method: 'POST', body: JSON.stringify({ brief }) });
      acceptRun(data.run);
      setEditingBrief(false);
      requestAnimationFrame(() => {
        resultHeadingRef.current?.focus({ preventScroll: true });
        resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      });
      await advance(data.run.id);
    } catch (prepareError) { setError(errorMessage(prepareError)); }
    finally { setBusy(false); }
  }

  async function resume() {
    if (!run) return;
    setBusy(true); setError(null);
    requestAnimationFrame(() => {
      resultHeadingRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
    try { await advance(run.id, answer ?? undefined); }
    catch (resumeError) { setError(errorMessage(resumeError)); }
    finally { setBusy(false); }
  }

  const modeMismatch = Boolean(run && config && run.mode !== config.mode);
  const running = busy || (run?.status === 'running' && !modeMismatch);
  const locked = running || loading || (run?.status === 'awaiting_input' && !modeMismatch);
  const complete = run?.status === 'completed' && !running;
  const isTest = (run?.mode ?? config?.mode) === 'test';
  const displayedError = error ?? (run?.status === 'failed' ? run.error : null);
  const totalMinutes = run?.pack?.agenda.reduce((total, item) => total + item.minutes, 0);
  const showBrief = !run || editingBrief;
  const starting = busy && showBrief;
  const awaitingAnswer = run?.status === 'awaiting_input' && !modeMismatch && !busy;
  const lastEvent = starting ? undefined : run?.events.at(-1);
  const latestUpdate = `${describeCurrentAction(starting ? null : run, starting, busy)}.${lastEvent && run ? ` Latest completed action: ${describeOutcome(lastEvent, run.brief.durationMinutes).title}.` : ''}`;
  const announcement = editingBrief && !running ? 'Edit the brief for a new preparation. Your saved workshop stays unchanged until you prepare again.' : loading ? 'Loading your workspace.' : awaitingAnswer ? `One detail needed. ${run?.clarification?.question ?? 'Choose the workshop format to continue.'}` : complete ? 'Your workshop pack is ready. Review the sections, then download Markdown to edit.' : running ? `Preparing your workshop. ${latestUpdate}` : run?.status === 'ready' ? 'Your saved preparation is ready to resume.' : '';

  useEffect(() => {
    if (loading || busy || !run || modeMismatch) return;
    const state = `${run.id}:${run.status}`;
    if (handoffRef.current === state) return;
    handoffRef.current = state;
    const target = run.status === 'awaiting_input' ? questionRef.current : run.status === 'completed' || run.status === 'ready' ? resultHeadingRef.current : null;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  }, [loading, busy, run?.id, run?.status, modeMismatch]);

  function changeBrief() {
    if (run) setBrief(run.brief);
    setEditingBrief(true);
    requestAnimationFrame(() => {
      briefHeadingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }

  function returnToWorkshop() {
    if (run) setBrief(run.brief);
    setEditingBrief(false);
    requestAnimationFrame(() => {
      resultHeadingRef.current?.focus({ preventScroll: true });
      resultHeadingRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
  }

  const materialLibrary = <AnimatedDetails className="brief-materials" summary={<><span><BookOpen size={15} aria-hidden="true" />3 fixed example materials</span><Plus size={14} aria-hidden="true" /></>}>
    <div className="brief-materials-content"><p>Fictional references for this demo. Uploads and source editing are not available.</p><div>{materials.map(material => <button type="button" key={material.id} className="work-source" data-source-id={material.id} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setSelectedMaterial(material); }}><BookOpen size={13} aria-hidden="true" />{material.title}</button>)}</div></div>
  </AnimatedDetails>;

  const briefPanel = <section className="brief-panel" aria-labelledby="brief-heading">
    <div className="section-heading"><h2 id="brief-heading" ref={briefHeadingRef} tabIndex={-1}>Workshop brief</h2><span className="brief-example-label">{run ? 'From your current workshop' : 'Edit the example below'}</span></div>
    <form onSubmit={prepare}>
      <fieldset disabled={locked} className="brief-fields">
        <div className="brief-field"><label htmlFor="audience">Who’s in the room?</label><textarea id="audience" rows={2} value={brief.audience} required minLength={3} maxLength={300} onChange={event => setBrief({ ...brief, audience: event.target.value })} /></div>
        <div className="brief-field"><label htmlFor="objective">What should they leave with?</label><textarea id="objective" rows={2} value={brief.objective} required minLength={10} maxLength={1200} onChange={event => setBrief({ ...brief, objective: event.target.value })} /></div>
        <div className="brief-pair"><div><label htmlFor="duration">Time available</label><div className="duration-input"><input id="duration" type="number" min={30} max={240} step={1} value={brief.durationMinutes} required aria-describedby="duration-hint" onChange={event => setBrief({ ...brief, durationMinutes: Number(event.target.value) })} /><span>minutes</span></div><span className="field-hint" id="duration-hint">30–240 minutes</span></div><div><label htmlFor="format">Session format</label><select id="format" value={brief.format} onChange={event => setBrief({ ...brief, format: event.target.value as Brief['format'] })}><option value="">Ask me next</option><option value="in-person">In person</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option></select></div></div>
        <div className="brief-field"><label htmlFor="constraints">Anything to keep in mind? <span className="optional-label">Optional</span></label><textarea id="constraints" rows={2} value={brief.constraints} maxLength={1600} onChange={event => setBrief({ ...brief, constraints: event.target.value })} /></div>
      </fieldset>
      {materialLibrary}
      {run && <p className="new-run-note" id="new-run-note">Prepares a fresh workshop from this brief, without using the current pack. It replaces the workshop shown here. Download the current workshop first if you want to keep a copy.</p>}
      <div className="prepare-action"><button type="submit" className="primary-button prepare-button" disabled={locked || !config?.ready} aria-describedby={run ? 'new-run-note' : undefined}><span>{loading ? 'Loading workspace…' : 'Prepare workshop'}</span><Arrow /></button><span className="form-footnote">{brief.format ? 'Review the result before using it.' : 'The agent will ask for the format next.'}</span></div>
    </form>
  </section>;

  const resultPanel = <div className="result-column" ref={resultRef}>
    <section className={`pack-panel ${!run?.pack || starting ? 'without-pack' : ''} ${complete ? 'pack-complete' : ''}`} aria-labelledby={complete ? 'result-heading' : 'pack-heading'} aria-busy={running}>
      {!complete && <div className="section-heading pack-heading"><h2 id="pack-heading" ref={resultHeadingRef} tabIndex={-1}>Agent’s work</h2><span className="pack-status">{awaitingAnswer ? 'Your answer needed' : running ? 'In preparation' : run?.status === 'failed' ? 'Preparation stopped' : 'Saved progress'}</span></div>}
      {!complete && <AgentWork run={run} starting={starting} busy={busy} inProgress={running} materials={materials} onRead={setSelectedMaterial}>
        {awaitingAnswer && !starting && <div className="clarification"><div className="clarification-top"><span className="question-icon" aria-hidden="true"><CircleHelp size={14} /></span><div><span className="eyebrow">Your input</span><h3 ref={questionRef} tabIndex={-1}>{run.clarification?.question ?? 'How will this workshop be delivered?'}</h3></div></div><p>The format changes how participants collaborate. Choose one to continue.</p><div className="format-options" role="group" aria-label="Workshop format">{Object.entries(formatNames).map(([value, label]) => <button type="button" key={value} aria-pressed={answer === value} disabled={busy} onClick={() => setAnswer(value as Exclude<Brief['format'], ''>)} className={answer === value ? 'selected' : ''}>{label}</button>)}</div><button type="button" className="primary-button continue-button" disabled={!answer || busy} onClick={() => void resume()}>{busy ? 'Continuing preparation…' : 'Continue preparation'}<Arrow small /></button><span className="saved-note">Progress saved. You can return to this question.</span></div>}
        {run && !busy && run.status === 'ready' && !modeMismatch && <div className="resume-panel"><p>This saved run is ready to continue.</p><button type="button" className="primary-button" onClick={() => void resume()}>Resume preparation<Arrow small /></button></div>}
      </AgentWork>}
      {run?.pack && !starting ? <>
        {!complete && <><div className="draft-so-far"><h3>Draft so far</h3><span>Draft {run.revision} · Provisional until checks finish</span></div><div className="pack-title"><h3>{run.pack.title}</h3><p>{run.pack.outcome}</p></div></>}
        {complete && <div className="result-summary"><h2 id="result-heading">Your workshop pack</h2><span className="work-label">Workshop goal</span><p className="pack-outcome">{run.pack.outcome}</p></div>}
        <div className="validation-bar"><span className={`validation-result ${run.validation?.valid ? 'passed' : 'pending'}`}><span aria-hidden="true">{run.validation?.valid ? <CircleCheck size={12} /> : <CircleDot size={12} />}</span>{run.validation?.valid ? 'Timing & reference checks passed' : run.validation ? 'Correction needed' : 'Awaiting checks'}</span><span>{totalMinutes} / {run.brief.durationMinutes} min</span>{run.revision > 0 && <span>Draft {run.revision}</span>}</div>
        {run.validation && !run.validation.valid && <ul className="validation-issues">{run.validation.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        <div className="pack-tabs" role="tablist" aria-label="Workshop pack sections">{(['agenda', 'exercise', 'notes', 'sources'] as PackTab[]).map(item => <button type="button" role="tab" id={`tab-${item}`} aria-controls={`panel-${item}`} aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={event => {
          const tabs: PackTab[] = ['agenda', 'exercise', 'notes', 'sources'];
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (tabs.indexOf(item) + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
            setTab(tabs[next]); document.getElementById(`tab-${tabs[next]}`)?.focus();
          }
        }} key={item}>{item === 'notes' ? 'Facilitator notes' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <div key={tab} className="pack-tab-content" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}><PackContent pack={run.pack} tab={tab} run={run} materials={materials} onRead={setSelectedMaterial} /></div>
      </> : run?.status === 'failed' ? <div className="draft-waiting"><h3>No workshop saved</h3><p>Use New preparation above to try again from your brief.</p></div> : <div className="draft-waiting"><p>No draft returned yet. It will appear here when available.</p></div>}
    </section>
    {run && !starting && !complete && <AnimatedDetails className="activity-disclosure" summary={<><span><Workflow size={16} aria-hidden="true" />Tool inputs and results <span className="count">{run.events.length}</span></span><Plus size={14} aria-hidden="true" /></>}><Activity run={run} busy={Boolean(running)} /></AnimatedDetails>}
    {complete && run && <section className="export-panel" id="export-workshop" aria-labelledby="export-heading">
      <div className="export-handoff"><div><h2 id="export-heading">Take this workshop with you</h2><p>Review the sections above, then download Markdown to edit in your own document.</p></div><a className="primary-button" href={`/api/runs/${encodeURIComponent(run.id)}/download?format=md`} download><DownloadIcon />Download Markdown</a></div>
      <AnimatedDetails key={run.id} className="run-record" summary={<><span><Workflow size={15} aria-hidden="true" />Run record <span className="record-hint">Steps, checks and corrections</span></span><Plus size={14} aria-hidden="true" /></>}>
        <AgentWork run={run} starting={false} busy={false} materials={materials} onRead={setSelectedMaterial} history />
        <div className="record-download"><p>Recorded preparation steps, tool results and the saved pack.</p><a className="secondary-button" href={`/api/runs/${encodeURIComponent(run.id)}/download?format=json`} download><DownloadIcon />Download JSON</a></div><Activity run={run} busy={false} />
      </AnimatedDetails>
    </section>}
  </div>;

  const reviewing = complete && !showBrief;
  const displayedBrief = showBrief ? brief : run?.brief ?? brief;
  return <main className="motion-ui" data-ready={!loading}>
    <header className="site-header"><a className="brand" href="/" aria-label="Workshop Prep Agent home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>workshop<span className="brand-light"> / prep agent</span></span></a><span className="prototype-label"><span />Independent prototype</span></header>
    <div className="page-shell">
      <section className={`page-intro ${reviewing ? 'review-intro' : ''}`}>
        <div className="page-heading-copy"><p className="runtime-note">{isTest ? <FlaskConical size={13} aria-hidden="true" /> : <Workflow size={13} aria-hidden="true" />}<span>{loading ? 'Loading workspace…' : isTest ? 'Demo test · no live model' : config?.ready ? 'Live AI preparation' : 'Preparation unavailable'}</span></p>
          <h1 id="workshop-title" ref={reviewing ? resultHeadingRef : undefined} tabIndex={reviewing ? -1 : undefined}>{reviewing ? run?.pack?.title ?? 'Your workshop' : showBrief && !running ? run ? 'New preparation' : 'Prepare your workshop' : run?.status === 'failed' && !running ? 'Preparation stopped' : 'Preparing your workshop'}</h1>
          {showBrief && !running ? <p className="intro-copy">{run ? 'Adjust the brief, then prepare a fresh workshop.' : 'Set the audience and goal. Get an agenda, an exercise and facilitator notes.'}</p> : <p className="workshop-context"><span>{displayedBrief.audience}</span><span>{displayedBrief.durationMinutes} min · {displayedBrief.format ? formatNames[displayedBrief.format] : 'Format to confirm'}</span></p>}
        </div>
        {run && <button type="button" className="secondary-button new-preparation" onClick={showBrief && !running ? returnToWorkshop : changeBrief} disabled={locked} title={locked ? 'Available when the current preparation finishes' : undefined}>{showBrief && !running ? <><ArrowLeft size={15} aria-hidden="true" />Back to workshop</> : <><Plus size={15} aria-hidden="true" />New preparation</>}</button>}
      </section>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      {modeMismatch && run && config && <div className="mode-banner live-mode" role="status"><div><strong>New preparations use {config.mode === 'live' ? 'live AI' : 'demo test mode · no live model'}</strong><span>The saved workshop used {run.mode === 'test' ? 'demo test mode' : 'live AI'}.</span></div></div>}
      {config && !config.ready && <div className="error-banner" role="alert"><strong>Setup required</strong><ul>{config.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
      {displayedError && <div className="error-banner" role="alert"><strong>Preparation needs attention</strong><p>{displayedError}</p>{run?.status !== 'failed' && <button type="button" className="text-button" onClick={() => setError(null)}>Dismiss</button>}</div>}
      <div className="workspace-flow">{showBrief && !running ? briefPanel : resultPanel}</div>
      <footer className="site-footer"><span>3 fixed fictional references · Human review required</span><span>Independent prototype · No customer outcomes claimed</span></footer>
    </div>
    <MaterialReader material={selectedMaterial} onClose={() => setSelectedMaterial(null)} fallbackFocusRef={showBrief && !running ? briefHeadingRef : resultHeadingRef} />
  </main>;
}
