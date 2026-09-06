'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CircleCheck, CircleDot, Download, FileText, FlaskConical, ListChecks, Minus, PenLine, Plus, TriangleAlert, Workflow } from 'lucide-react';
import type { AppConfig, Brief, Material, PublicRun, ToolEvent, WorkshopPack } from '@/lib/types';
import AnimatedDetails from './components/AnimatedDetails';
import MaterialReader from './components/MaterialReader';
import MaterialInput, { type MaterialTextDraft } from './components/MaterialInput';
import ContentReview from './components/ContentReview';
import ClarificationPrompt, { type ClarificationAnswer } from './components/ClarificationPrompt';
import { RevisionSummary } from './components/WorkshopRevision';
import AgentWork, { describeCurrentAction, describeOutcome } from './components/AgentWork';
import SessionTimeline from './components/SessionTimeline';
import WorkshopHome, { type WorkshopCardSummary } from './components/WorkshopHome';
import WorkshopManagementDialog, { type WorkshopAction } from './components/WorkshopManagementDialog';
import './workshop-home.css';
import './workshop-management.css';
import GeneratedProse from './components/GeneratedProse';
import WorkshopText, { CitedText } from './components/WorkshopText';
import { currentRunStorageKey, hydrateRecentRuns, parseRecentRuns, preferredRunId, recentRunSummary, recentRunsStorageKey, rememberRecentRun, removeRecentWorkshop, workshopFamilyId, type RecentRunSummary } from '@/lib/recent-runs';
import { canEditWorkshop, loadPendingWorkshopRevision, parseWorkshopDrafts, pendingWorkshopRevision, pendingWorkshopRevisionKey, workshopBriefDraft, workshopDraftKey, workshopDraftsStorageKey, workshopLocation, workshopPath, workshopPreparationRequest, type WorkshopBriefDraft, type WorkshopBriefDrafts, type WorkshopLocation } from '@/lib/workshop-navigation';

type PackTab = 'agenda' | 'exercise' | 'notes' | 'sources';
const initialBrief: Brief = {
  audience: '',
  objective: '',
  durationMinutes: 90,
  constraints: '',
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
  if (!response.ok) throw Object.assign(new Error(typeof result?.error === 'string' ? result.error : `Request failed (${response.status}). Please try again.`), { status: response.status });
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
  if (event.tool === 'review_content') return output.status === 'needs_revision' ? { tone: 'warning', label: 'Content review · changes needed' } : { tone: 'success', label: `${output.mode === 'scripted' ? 'Scripted' : 'AI-assisted'} content review complete` };
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
    return material ? <button type="button" key={id} className="source-tag source-link" data-source-id={id} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }} aria-label={`Read source: ${material.title}`}>{material.title}</button> : <span key={id} className="source-tag" data-source-id={id}>{id}</span>;
  })}</span>;
}

function PackContent({ pack, tab, run, materials, onRead }: { pack: WorkshopPack; tab: PackTab; run: PublicRun } & SourceActions) {
  if (tab === 'exercise') return <div className="pack-section"><div className="content-heading"><span className="eyebrow">Proposed workshop exercise{pack.exercise.durationMinutes ? ` · ${pack.exercise.durationMinutes} minutes` : ''}</span><h3><GeneratedProse text={pack.exercise.title} /></h3><Sources ids={pack.exercise.sourceIds} materials={materials} onRead={onRead} /></div>
    {pack.exercise.scenario && <div className="exercise-context"><h4>Participant scenario</h4><WorkshopText text={pack.exercise.scenario} materials={materials} onRead={onRead} /></div>}
    {pack.exercise.expectedOutput && <div className="exercise-context"><h4>What participants should produce</h4><WorkshopText text={pack.exercise.expectedOutput} materials={materials} onRead={onRead} /></div>}
    <h4>Instructions</h4><ol className="instruction-list">{pack.exercise.instructions.map((item, index) => <li key={`${index}-${item}`}><WorkshopText text={item} materials={materials} onRead={onRead} participantWorksheet /></li>)}</ol>
    {pack.exercise.sampleResponse && <div className="exercise-sample"><h4>Illustrative participant response</h4><WorkshopText text={pack.exercise.sampleResponse} materials={materials} onRead={onRead} /></div>}
    <div className="debrief"><h4>Bring the room back together</h4><ul>{pack.exercise.debrief.map((item, index) => <li key={`${index}-${item}`}><WorkshopText text={item} materials={materials} onRead={onRead} /></li>)}</ul></div></div>;
  if (tab === 'notes') return <div className="pack-section"><div className="content-heading"><span className="eyebrow">Before you lead</span><h3>Facilitator notes</h3></div><ul className="notes-list">{pack.facilitatorNotes.map((note, index) => <li key={`${index}-${note}`}><span className="note-index">{String(index + 1).padStart(2, '0')}</span><WorkshopText text={note} materials={materials} onRead={onRead} /></li>)}</ul></div>;
  if (tab === 'sources') return <div className="pack-section"><div className="content-heading"><span className="eyebrow">Keep the context close</span><h3>Sources used in this pack</h3><p className="quiet">Open a reference to read the source text saved with this workshop.</p></div><ul className="source-list">{pack.sources.map(source => {
    const material = materials.find(item => item.id === source.id);
    return <li key={source.id} data-source-id={source.id}><span className="source-document" aria-hidden="true"><FileText size={16} /></span><div><Sources ids={[source.id]} materials={materials} onRead={onRead} /><h4>{material ? <button type="button" className="source-title-link" onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }}>{source.title}<Arrow small /></button> : source.title}</h4></div></li>;
  })}</ul>{pack.sourceClaims && <div className="source-claims"><h4>Recorded source claims</h4><p className="quiet">Check these claims against the quoted passages. The agenda and exercise are proposed workshop design.</p>{pack.sourceClaims.length ? <ul>{pack.sourceClaims.map((claim, index) => <li key={`${claim.sourceId}-${index}`}><WorkshopText text={claim.claim} materials={materials} onRead={onRead} /><blockquote>{claim.quote}</blockquote><Sources ids={[claim.sourceId]} materials={materials} onRead={onRead} /></li>)}</ul> : <p className="quiet">No factual source claims were recorded for this pack.</p>}</div>}</div>;
  let elapsed = 0;
  const schedule = pack.agenda.map(item => {
    const start = elapsed;
    elapsed += item.minutes;
    return { ...item, start, end: elapsed };
  });
  const minute = (value: number) => String(value).padStart(2, '0');
  return <div className="pack-section agenda-section">
    <div className="agenda-overview"><span className="eyebrow">Session timeline</span><span>{elapsed} minutes · {run.brief.format ? formatNames[run.brief.format] : 'Format to confirm'}</span></div>
    <p className="workshop-design-note">Proposed agenda · Review the activities for your audience.</p>
    <SessionTimeline key={`${run.id}-${run.revision}`} agenda={pack.agenda} />
    <ol className="agenda-list">{schedule.map((item, index) => <li key={`${index}-${item.title}`}>
      <div className="agenda-time"><strong>{minute(item.start)}—{minute(item.end)}</strong><span>minutes</span></div>
      <div className="agenda-item"><h3><span className={`agenda-marker segment-${index % 5}`} /><GeneratedProse text={item.title} /></h3><WorkshopText text={item.activity} materials={materials} onRead={onRead} /><Sources ids={item.sourceIds} materials={materials} onRead={onRead} /></div>
    </li>)}</ol>
  </div>;

}

export default function Home() {
  const [brief, setBrief] = useState<Brief>(initialBrief);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [examples, setExamples] = useState<Material[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<Material[]>([]);
  const [materialBusy, setMaterialBusy] = useState(false);
  const [materialTextDraft, setMaterialTextDraft] = useState<MaterialTextDraft>({ title: '', content: '' });
  const [editRunId, setEditRunId] = useState<string | null>(null);
  const [editFeedback, setEditFeedback] = useState('');
  const [newDraftAvailable, setNewDraftAvailable] = useState(false);
  const draftsRef = useRef<WorkshopBriefDrafts>({});
  const [revisionOriginal, setRevisionOriginal] = useState<PublicRun | null>(null);
  const [run, setRun] = useState<PublicRun | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRunSummary[]>([]);
  const [cardDetails, setCardDetails] = useState<Record<string, WorkshopCardSummary>>({});
  const [workshopAction, setWorkshopAction] = useState<WorkshopAction | null>(null);
  const [managementBusy, setManagementBusy] = useState(false);
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null);
  const libraryEpochRef = useRef(0);
  const deletedRunIdsRef = useRef(new Set<string>());
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openingRun = openingId !== null;
  const [busy, setBusy] = useState(false);
  const preparationRequestRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PackTab>('agenda');
  const [view, setView] = useState<WorkshopLocation['view']>('home');
  const [draftStarted, setDraftStarted] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const runRef = useRef<PublicRun | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const briefHeadingRef = useRef<HTMLHeadingElement>(null);
  const handoffRef = useRef('');
  const recentRunsRef = useRef<RecentRunSummary[]>([]);
  const locationRef = useRef<WorkshopLocation>({ view: 'home' });
  const openSequenceRef = useRef(0);
  const navigationLockedRef = useRef(false);
  const persistRecent = useCallback((recent: RecentRunSummary[]) => {
    recentRunsRef.current = recent;
    setRecentRuns(recent);
    try { localStorage.setItem(recentRunsStorageKey, JSON.stringify(recent)); } catch { /* The server still holds the saved workshop. */ }
  }, []);
  const navigateTo = useCallback((destination: WorkshopLocation, history: 'push' | 'replace' | false = 'push') => {
    locationRef.current = destination;
    setView(destination.view);
    if (history && `${window.location.pathname}${window.location.search}` !== workshopPath(destination)) {
      window.history[history === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', workshopPath(destination));
    }
  }, []);
  const rememberRun = useCallback((next: PublicRun) => {
    const summary = recentRunSummary(next, recentRunsRef.current);
    const recent = rememberRecentRun(recentRunsRef.current, next);
    libraryEpochRef.current++;
    persistRecent(recent);
    const displayed = recent.find(item => workshopFamilyId(item) === workshopFamilyId(summary));
    try { localStorage.setItem(currentRunStorageKey, displayed?.id ?? next.id); } catch { /* The server still persists the run if browser storage is unavailable. */ }
  }, [persistRecent]);
  const acceptRun = useCallback((next: PublicRun) => {
    if (deletedRunIdsRef.current.has(next.id)) return;
    if (runRef.current?.id === next.id && runRef.current.version > next.version) return;
    next = { ...next, workshopId: next.workshopId ?? (runRef.current?.id === next.id ? runRef.current.workshopId : undefined) ?? recentRunSummary(next, recentRunsRef.current).workshopId };
    runRef.current = next;
    setRun(next);
    rememberRun(next);
    if (next.status === 'completed') {
      try {
        const pending = pendingWorkshopRevision(localStorage.getItem(pendingWorkshopRevisionKey));
        if (pending?.id === next.id) {
          localStorage.removeItem(pendingWorkshopRevisionKey);
          if (pending.originalId) {
            localStorage.removeItem(`workshop-prep-revision-input-${pending.originalId}`);
            const remaining = { ...draftsRef.current };
            delete remaining[pending.originalId];
            draftsRef.current = remaining;
            sessionStorage.setItem(workshopDraftsStorageKey, JSON.stringify(remaining));
          }
        }
      } catch { /* Saved versions remain accessible without browser storage. */ }
    }
  }, [rememberRun]);
  const applyBriefDraft = useCallback((draft: WorkshopBriefDraft, targetId: string | null) => {
    setBrief(draft.brief);
    setSelectedMaterials(draft.materials);
    setMaterialTextDraft(draft.textDraft);
    setEditFeedback(draft.feedback);
    setEditRunId(targetId);
    setDraftStarted(true);
  }, []);
  const persistDrafts = useCallback((drafts: WorkshopBriefDrafts) => {
    draftsRef.current = drafts;
    setNewDraftAvailable(Boolean(drafts.new));
    try { sessionStorage.setItem(workshopDraftsStorageKey, JSON.stringify(drafts)); } catch { /* Keep the visible input when browser storage is unavailable. */ }
  }, []);
  function saveBriefDraft() {
    if (!draftStarted) return;
    persistDrafts({ ...draftsRef.current, [workshopDraftKey(editRunId)]: { brief, materials: selectedMaterials, textDraft: materialTextDraft, feedback: editFeedback } });
  }
  function draftForSavedWorkshop(source: PublicRun, fallbackMaterials: Material[]) {
    if (draftsRef.current[source.id]) return draftsRef.current[source.id];
    let legacyInput: string | null = null;
    try {
      legacyInput = localStorage.getItem(`workshop-prep-revision-input-${source.id}`);
      const pending = pendingWorkshopRevision(localStorage.getItem(pendingWorkshopRevisionKey));
      if (pending?.id === source.id && pending.originalId && draftsRef.current[pending.originalId]) return draftsRef.current[pending.originalId];
      if (!legacyInput && pending?.id === source.id && pending.originalId) legacyInput = localStorage.getItem(`workshop-prep-revision-input-${pending.originalId}`);
    } catch { /* Use the saved brief and materials. */ }
    return workshopBriefDraft(source.brief, source.materials ?? fallbackMaterials, legacyInput);
  }
  useEffect(() => {
    if (!loading) saveBriefDraft();
  }, [loading, draftStarted, editRunId, brief, selectedMaterials, materialTextDraft, editFeedback]);

  const recentKey = JSON.stringify(recentRuns);
  useEffect(() => {
    if (view !== 'home' || loading || workshopAction) return;
    const epoch = ++libraryEpochRef.current;
    const controller = new AbortController();
    // Hydrate only this browser's known workshops. Brief contents stay out of browser history storage.
    const snapshot = recentRunsRef.current;
    void Promise.all(snapshot.map(async item => {
      try {
        const data = await api<{ run: PublicRun; canManage: boolean }>(`/api/runs/${encodeURIComponent(item.id)}`, { signal: controller.signal, cache: 'no-store' });
        return { run: data.run, card: {
          ...recentRunSummary(data.run, snapshot), audience: data.run.brief.audience,
          durationMinutes: data.run.brief.durationMinutes, format: data.run.brief.format,
          canManage: data.canManage,
          canDuplicate: Boolean(data.run.pack && ['completed', 'failed'].includes(data.run.status)),
        } };
      } catch {
        return { run: null, card: { ...item, canManage: false, unavailable: true } };
      }
    })).then(entries => {
      if (controller.signal.aborted || libraryEpochRef.current !== epoch) return;
      const hydrated = entries.flatMap(entry => entry.run ? [entry.run] : []);
      const recent = hydrateRecentRuns(snapshot, hydrated);
      // Replace a legacy pointer to a hidden version before discarding its hydrated metadata.
      try {
        const currentId = localStorage.getItem(currentRunStorageKey);
        const current = entries.find(entry => entry.card.id === currentId)?.card;
        const displayed = current && recent.find(item => workshopFamilyId(item) === workshopFamilyId(current));
        if (displayed && displayed.id !== currentId) localStorage.setItem(currentRunStorageKey, displayed.id);
      } catch { /* Browser history may be unavailable. */ }
      setCardDetails(Object.fromEntries(entries.map(entry => [entry.card.id, entry.card])));
      if (JSON.stringify(recent) !== JSON.stringify(snapshot)) persistRecent(recent);
    });
    return () => { controller.abort(); };
  }, [view, loading, recentKey, workshopAction, persistRecent]);

  function beginWorkshopAction(id: string, kind: WorkshopAction['kind']) {
    if (navigationLockedRef.current || openingRun) return;
    const item = cardDetails[id];
    if (!item || (kind === 'duplicate' ? !item.canDuplicate || item.unavailable : !item.canManage)) return;
    libraryEpochRef.current++;
    setLibraryNotice(null);
    setWorkshopAction({ id, title: item.title, kind });
  }

  function workshopRenamed(next: PublicRun) {
    libraryEpochRef.current++;
    const summary = recentRunSummary(next, recentRunsRef.current);
    next = { ...next, workshopId: summary.workshopId };
    persistRecent(recentRunsRef.current.map(item => item.id === next.id ? summary : item));
    setCardDetails(current => ({ ...current, [next.id]: { ...summary, audience: next.brief.audience, durationMinutes: next.brief.durationMinutes, format: next.brief.format, canManage: true, canDuplicate: Boolean(next.pack && ['completed', 'failed'].includes(next.status)) } }));
    if (runRef.current?.id === next.id) { runRef.current = next; setRun(next); }
    if (revisionOriginal?.id === next.id) setRevisionOriginal(next);
    setLibraryNotice('Workshop name saved.');
  }

  function workshopDuplicated(next: PublicRun) {
    rememberRun(next);
    setCardDetails(current => ({ ...current, [next.id]: { ...recentRunSummary(next), audience: next.brief.audience, durationMinutes: next.brief.durationMinutes, format: next.brief.format, canManage: true, canDuplicate: Boolean(next.pack && ['completed', 'failed'].includes(next.status)) } }));
    setLibraryNotice('Workshop duplicated. Your copy is ready to open.');
  }

  function workshopDeleted(id: string) {
    deletedRunIdsRef.current.add(id);
    libraryEpochRef.current++;
    openSequenceRef.current++;
    persistRecent(recentRunsRef.current.filter(item => item.id !== id));
    setCardDetails(current => { const remaining = { ...current }; delete remaining[id]; return remaining; });
    try {
      if (localStorage.getItem(currentRunStorageKey) === id) localStorage.removeItem(currentRunStorageKey);
      if (pendingWorkshopRevision(localStorage.getItem(pendingWorkshopRevisionKey))?.id === id) localStorage.removeItem(pendingWorkshopRevisionKey);
    } catch { /* Browser history may be unavailable. */ }
    if (runRef.current?.id === id) { runRef.current = null; setRun(null); handoffRef.current = ''; }
    if (revisionOriginal?.id === id) setRevisionOriginal(null);
    setOpeningId(null);
    setLibraryNotice('Workshop deleted. Separate revisions are still available.');
  }

  function removeWorkshopFromBrowser(id: string) {
    if (navigationLockedRef.current || openingRun || workshopAction) return;
    const target = recentRunsRef.current.find(item => item.id === id) ?? cardDetails[id];
    if (!target) return;
    libraryEpochRef.current++;
    const known = [...Object.values(cardDetails), ...(runRef.current ? [runRef.current] : []), ...(revisionOriginal ? [revisionOriginal] : [])];
    let currentId: string | null = null;
    try { currentId = localStorage.getItem(currentRunStorageKey); } catch { /* Browser history may be unavailable. */ }
    const removal = removeRecentWorkshop(recentRunsRef.current, target, currentId, known);
    persistRecent(removal.recent);
    setCardDetails(current => Object.fromEntries(Object.entries(current).filter(([, item]) => workshopFamilyId(item) !== workshopFamilyId(target))));
    // A legacy pointer may refer to an older member of the removed workshop family.
    try {
      if (removal.clearCurrentRun) localStorage.removeItem(currentRunStorageKey);
      const pending = pendingWorkshopRevision(localStorage.getItem(pendingWorkshopRevisionKey));
      if (pending && [pending.id, pending.originalId, pending.parentId].some(member => member && removeRecentWorkshop(recentRunsRef.current, target, member, known).clearCurrentRun)) localStorage.removeItem(pendingWorkshopRevisionKey);
    } catch { /* Browser history may be unavailable. */ }
    setLibraryNotice('Workshop removed from this browser. You can reopen it from its saved link.');
    requestAnimationFrame(() => document.getElementById('workshop-home-heading')?.focus({ preventScroll: true }));
  }

  useEffect(() => {
    const parentId = run?.parentRunId;
    if (!parentId) { setRevisionOriginal(null); return; }
    if (deletedRunIdsRef.current.has(parentId)) return;
    if (revisionOriginal?.id === parentId) return;
    let active = true;
    void api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(parentId)}`).then(data => { if (active && !deletedRunIdsRef.current.has(parentId)) setRevisionOriginal(data.run); }).catch(() => { /* The revised pack remains available if its parent cannot be loaded. */ });
    return () => { active = false; };
  }, [run?.parentRunId, revisionOriginal?.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const destination = workshopLocation(window.location.search);
      navigateTo(destination, false);
      try {
        const [configuration, sourceData] = await Promise.all([api<AppConfig>('/api/config'), api<{ materials: Material[] }>('/api/materials')]);
        if (cancelled) return;
        setConfig(configuration);
        setExamples(sourceData.materials);
        let savedId: string | null = null;
        let recent: RecentRunSummary[] = [];
        try {
          savedId = localStorage.getItem(currentRunStorageKey);
          recent = parseRecentRuns(localStorage.getItem(recentRunsStorageKey));
        } catch { /* Browser storage is optional. */ }
        recentRunsRef.current = recent;
        setRecentRuns(recent);
        try { persistDrafts(parseWorkshopDrafts(sessionStorage.getItem(workshopDraftsStorageKey))); } catch { /* Drafts still work in this page if storage is unavailable. */ }
        if (destination.view === 'brief' && !destination.runId) applyBriefDraft(draftsRef.current.new ?? workshopBriefDraft(initialBrief), null);
        const requestedId = destination.view === 'workshop' || destination.view === 'brief' ? destination.runId : null;
        let pending: ReturnType<typeof pendingWorkshopRevision> = null;
        try { pending = pendingWorkshopRevision(localStorage.getItem(pendingWorkshopRevisionKey)); } catch { /* Legacy revision storage is optional. */ }
        let pendingRun: PublicRun | null = null;
        if (pending) {
          try {
            pendingRun = (await api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(pending.id)}`)).run;
            if (cancelled) return;
            rememberRun(pendingRun);
            const pendingForRequest = requestedId && [pending.originalId, pending.parentId, pending.id].includes(requestedId);
            if (pendingForRequest && ['ready', 'running', 'awaiting_input'].includes(pendingRun.status)) {
              acceptRun(pendingRun);
              setDraftStarted(false);
              navigateTo({ view: 'workshop', runId: pendingRun.id }, 'replace');
              return;
            }
          } catch { /* Keep the pending pointer for another attempt to reopen its saved link. */ }
        }
        const legacyId = preferredRunId('', savedId);
        const restoreId = requestedId ?? (legacyId && !recentRunsRef.current.some(item => item.id === legacyId) ? legacyId : null);
        if (restoreId) {
          try {
            const restored = pendingRun?.id === restoreId ? pendingRun : (await api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(restoreId)}`)).run;
            if (!cancelled) {
              if (requestedId) {
                acceptRun(restored);
                if (destination.view === 'brief') {
                  if (!canEditWorkshop(restored)) throw new Error('This saved version has no completed or stopped pack to edit.');
                  applyBriefDraft(draftForSavedWorkshop(restored, sourceData.materials), restored.id);
                }
              } else rememberRun(restored);
            }
          } catch (restoreError) {
            if (!cancelled && requestedId) {
              setError(`This saved workshop could not be opened. ${errorMessage(restoreError)}`);
              navigateTo({ view: 'home' }, 'replace');
            }
          }
        }
      } catch (loadError) { if (!cancelled) setError(errorMessage(loadError)); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [acceptRun, rememberRun, navigateTo, applyBriefDraft, persistDrafts]);

  useEffect(() => {
    if ((!busy && run?.status !== 'running') || !run?.id) return;
    const id = run.id;
    let active = true;
    const timer = setInterval(() => {
      void api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(id)}`).then(data => { if (active) acceptRun(data.run); }).catch(() => { /* The active request reports actionable failures. */ });
    }, 850);
    return () => { active = false; clearInterval(timer); };
  }, [busy, run?.id, run?.status, acceptRun]);

  async function advance(id: string, answer: ClarificationAnswer = {}) {
    const data = await api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(id)}/advance`, { method: 'POST', body: JSON.stringify(answer) });
    acceptRun(data.run);
    setConfig(await api<AppConfig>('/api/config'));
    if (data.run.status === 'failed') setError(data.run.error || 'Preparation stopped. Review the tool activity below.');
  }

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || preparationRequestRef.current) return;
    if (materialTextDraft.title || materialTextDraft.content) { setError('Add or discard the pasted material before preparing the workshop.'); return; }
    if (!selectedMaterials.length) { setError('Select at least one material before preparing the workshop.'); return; }
    preparationRequestRef.current = true;
    setBusy(true); setError(null); setTab('agenda');
    requestAnimationFrame(() => {
      resultHeadingRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
    try {
      const targetId = editRunId;
      const request = workshopPreparationRequest({ brief, materials: selectedMaterials, textDraft: materialTextDraft, feedback: editFeedback }, targetId);
      const data = await api<{ run: PublicRun }>(request.url, { method: 'POST', body: JSON.stringify(request.body) });
      if (targetId) {
        setRevisionOriginal(runRef.current?.id === targetId ? runRef.current : null);
        try {
          localStorage.setItem(pendingWorkshopRevisionKey, JSON.stringify({ id: data.run.id, originalId: targetId, parentId: targetId }));
          localStorage.removeItem(`workshop-prep-revision-input-${targetId}`);
        } catch { /* The new version contains the submitted brief and materials. */ }
      }
      acceptRun(data.run);
      setDraftStarted(false);
      const remainingDrafts = { ...draftsRef.current };
      if (targetId) remainingDrafts[targetId] = { brief, materials: selectedMaterials, textDraft: materialTextDraft, feedback: editFeedback };
      else delete remainingDrafts.new;
      persistDrafts(remainingDrafts);
      navigateTo({ view: 'workshop', runId: data.run.id }, 'replace');
      requestAnimationFrame(() => {
        resultHeadingRef.current?.focus({ preventScroll: true });
        resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      });
      await advance(data.run.id);
    } catch (prepareError) { setError(errorMessage(prepareError)); }
    finally { preparationRequestRef.current = false; setBusy(false); }
  }

  async function resume(answer: ClarificationAnswer = {}) {
    if (!run || preparationRequestRef.current) return;
    preparationRequestRef.current = true;
    setBusy(true); setError(null);
    requestAnimationFrame(() => {
      resultHeadingRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
    try { await advance(run.id, answer); }
    catch (resumeError) { setError(errorMessage(resumeError)); }
    finally { preparationRequestRef.current = false; setBusy(false); }
  }

  const modeMismatch = Boolean(run && config && run.mode !== config.mode);
  const running = busy || (run?.status === 'running' && !modeMismatch);
  const navigationLocked = running || loading || materialBusy || Boolean(workshopAction) || (run?.status === 'awaiting_input' && !modeMismatch);
  navigationLockedRef.current = Boolean(navigationLocked);
  const locked = navigationLocked || openingRun;

  const pendingMaterialText = Boolean(materialTextDraft.title || materialTextDraft.content);
  const unfinishedInput = draftStarted && Boolean(brief.audience || brief.objective || brief.constraints || brief.format || brief.durationMinutes !== initialBrief.durationMinutes || selectedMaterials.length || pendingMaterialText);
  const complete = run?.status === 'completed' && !running;
  const displayedError = error ?? (view === 'workshop' && run?.status === 'failed' ? run.error : null);
  const totalMinutes = run?.pack?.agenda.reduce((total, item) => total + item.minutes, 0);
  const showBrief = view === 'brief';
  const showHome = view === 'home';
  const isTest = (showHome || showBrief && !editRunId ? config?.mode : run?.mode ?? config?.mode) === 'test';
  const runMaterials = run?.materials ?? examples;
  const displayedMaterials = showBrief ? selectedMaterials : runMaterials;
  const examplesOnly = displayedMaterials.length > 0 && displayedMaterials.every(material => examples.some(example => example.id === material.id));
  const starting = busy && showBrief;
  const awaitingAnswer = run?.status === 'awaiting_input' && !modeMismatch && !busy;
  const lastEvent = starting ? undefined : run?.events.at(-1);
  const latestUpdate = `${describeCurrentAction(starting ? null : run, starting, busy)}.${lastEvent && run ? ` Latest completed action: ${describeOutcome(lastEvent, run.brief.durationMinutes).title}.` : ''}`;
  const announcement = openingRun ? 'Opening the selected workshop.' : showHome ? 'Your workshops. Start a new workshop or open saved work.' : showBrief && !running ? 'Define your workshop and add its reference materials.' : loading ? 'Loading your workspace.' : awaitingAnswer ? `One detail needed. ${run?.clarification?.question ?? 'Choose the workshop format to continue.'}` : complete ? 'Your workshop pack is ready for your review. Download PDF to share or print, or Word to edit.' : running ? `Preparing your workshop. ${latestUpdate}` : run?.status === 'ready' ? 'Your saved preparation is ready to resume.' : '';

  useEffect(() => {
    if (view !== 'workshop' || loading || busy || !run || modeMismatch) return;
    const state = `${run.id}:${run.status}`;
    if (handoffRef.current === state) return;
    handoffRef.current = state;
    const target = run.status === 'awaiting_input' ? questionRef.current : run.status === 'completed' || run.status === 'ready' ? resultHeadingRef.current : null;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  }, [view, loading, busy, run?.id, run?.status, modeMismatch]);

  useEffect(() => {
    if (loading) return;
    if (view === 'home') document.getElementById('workshop-home-heading')?.focus({ preventScroll: true });
    else if (view === 'brief' && !busy) briefHeadingRef.current?.focus({ preventScroll: true });
    else if (view === 'workshop') focusOpenedWorkshop();
  }, [view, loading]);

  useEffect(() => {
    function onPopState() {
      const destination = workshopLocation(window.location.search);
      if (navigationLockedRef.current) {
        window.history.pushState(window.history.state, '', workshopPath(locationRef.current));
        setError('Finish the current preparation before leaving this step.');
        return;
      }
      setSelectedMaterial(null);
      if (destination.view === 'workshop') void openRecentWorkshop(destination.runId, false).catch(() => {});
      else if (destination.view === 'brief' && destination.runId) void editExistingWorkshop(destination.runId, false).catch(() => {});
      else if (destination.view === 'brief') showNewBrief(false);
      else {
        saveBriefDraft();
        openSequenceRef.current++;
        setOpeningId(null);
        setDraftStarted(false);
        setError(null);
        navigateTo(destination, false);
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigateTo, run?.id, view, locked, draftStarted, unfinishedInput, brief, selectedMaterials, materialTextDraft, editFeedback, editRunId]);

  useEffect(() => {
    if (!unfinishedInput && !managementBusy) return;
    const keepDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', keepDraft);
    return () => window.removeEventListener('beforeunload', keepDraft);
  }, [unfinishedInput, managementBusy]);

  function showNewBrief(history: 'push' | false = 'push') {
    if (navigationLockedRef.current) return;
    openSequenceRef.current++;
    setOpeningId(null);
    saveBriefDraft();
    applyBriefDraft(draftsRef.current.new ?? workshopBriefDraft(initialBrief), null);
    setError(null);
    navigateTo({ view: 'brief' }, history);
    requestAnimationFrame(() => {
      briefHeadingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }
  function changeBrief() { showNewBrief(); }

  async function editExistingWorkshop(id: string, history: 'push' | false = 'push') {
    if (navigationLockedRef.current) throw new Error('Finish the current preparation before editing its brief.');
    saveBriefDraft();
    const sequence = ++openSequenceRef.current;
    setOpeningId(id);
    setError(null);
    try {
      let pending: ReturnType<typeof pendingWorkshopRevision> = null;
      try { pending = pendingWorkshopRevision(localStorage.getItem(pendingWorkshopRevisionKey), id); } catch { /* Legacy revision storage is optional. */ }
      if (pending) {
        const child = await loadPendingWorkshopRevision(pending.id, async childId => (await api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(childId)}`)).run);
        if (sequence !== openSequenceRef.current) return;
        if (!child) {
          try {
            if (pendingWorkshopRevision(localStorage.getItem(pendingWorkshopRevisionKey))?.id === pending.id) localStorage.removeItem(pendingWorkshopRevisionKey);
          } catch { /* The preserved parent can still be edited without browser storage. */ }
        } else if (['ready', 'running', 'awaiting_input'].includes(child.status)) {
          acceptRun(child);
          setDraftStarted(false);
          navigateTo({ view: 'workshop', runId: child.id }, history);
          return;
        }
      }
      const source = runRef.current?.id === id ? runRef.current : (await api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(id)}`)).run;
      if (sequence !== openSequenceRef.current) return;
      if (!canEditWorkshop(source)) throw new Error('This saved version has no completed or stopped pack to edit.');
      const draft = draftForSavedWorkshop(source, examples);
      acceptRun(source);
      applyBriefDraft(draft, source.id);
      setSelectedMaterial(null);
      navigateTo({ view: 'brief', runId: source.id }, history);
      requestAnimationFrame(() => {
        briefHeadingRef.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    } catch (cause) {
      if (sequence === openSequenceRef.current) {
        setError(errorMessage(cause));
        window.history.replaceState(window.history.state, '', workshopPath(locationRef.current));
      }
      throw cause;
    } finally { if (sequence === openSequenceRef.current) setOpeningId(null); }
  }

  function returnHome() {
    if (navigationLockedRef.current) { setError('Finish the current preparation before leaving this step.'); return; }
    openSequenceRef.current++;
    setOpeningId(null);
    setSelectedMaterial(null);
    setError(null);
    saveBriefDraft();
    setDraftStarted(false);
    navigateTo({ view: 'home' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function openRecentWorkshop(id: string, history: 'push' | false = 'push') {
    if (navigationLockedRef.current) throw new Error('Finish the current preparation before opening another workshop.');
    saveBriefDraft();
    const sequence = ++openSequenceRef.current;
    if (id === runRef.current?.id && !cardDetails[id]?.unavailable) {
      setOpeningId(null);
      setError(null);
      setSelectedMaterial(null);
      setDraftStarted(false);
      navigateTo({ view: 'workshop', runId: id }, history);
      return;
    }
    setOpeningId(id);
    setError(null);
    try {
      const data = await api<{ run: PublicRun }>(`/api/runs/${encodeURIComponent(id)}`);
      if (sequence !== openSequenceRef.current) throw new Error('Workshop navigation was cancelled.');
      acceptRun(data.run);
      setDraftStarted(false);
      navigateTo({ view: 'workshop', runId: data.run.id }, history);
      setRevisionOriginal(null);
      setSelectedMaterial(null);
      setTab('agenda');
    } catch (openError) {
      const message = `The selected workshop could not be opened. ${errorMessage(openError)}`;
      if (sequence === openSequenceRef.current) {
        setError(message);
        window.history.replaceState(window.history.state, '', workshopPath(locationRef.current));
      }
      throw new Error(message);
    }
    finally { if (sequence === openSequenceRef.current) setOpeningId(null); }
  }

  function focusOpenedWorkshop() {
    const target = runRef.current?.status === 'awaiting_input' ? questionRef.current ?? resultHeadingRef.current : resultHeadingRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  const briefPanel = <section className="brief-panel" aria-labelledby="brief-heading">
    <div className="section-heading"><h2 id="brief-heading">Audience and goal</h2><span className="brief-example-label">{editRunId ? 'Edit this workshop' : 'Start with the outcome'}</span></div>
    {editRunId && <div className="brief-edit-context"><p>Editing <strong><GeneratedProse text={run?.displayName || run?.pack?.title || 'this saved workshop'} /></strong>. Preparing again updates its existing card and preserves the previous version.</p><button type="button" className="text-button" disabled={Boolean(locked)} onClick={() => { void openRecentWorkshop(editRunId).catch(() => {}); }}>Back to saved pack</button></div>}
    <form onSubmit={prepare}>
      <fieldset disabled={locked} className="brief-fields">
        <div className="brief-field"><label htmlFor="audience">Who’s in the room?</label><textarea id="audience" rows={2} value={brief.audience} required minLength={3} maxLength={300} onChange={event => setBrief({ ...brief, audience: event.target.value })} /></div>
        <div className="brief-field"><label htmlFor="objective">What should they leave with?</label><textarea id="objective" rows={2} value={brief.objective} required minLength={10} maxLength={1200} onChange={event => setBrief({ ...brief, objective: event.target.value })} /></div>
        <div className="brief-pair"><div><label htmlFor="duration">Time available</label><div className="duration-input"><input id="duration" type="number" min={30} max={240} step={1} value={brief.durationMinutes} required aria-describedby="duration-hint" onChange={event => setBrief({ ...brief, durationMinutes: Number(event.target.value) })} /><span>minutes</span></div><span className="field-hint" id="duration-hint">30–240 minutes</span></div><div><label htmlFor="format">Session format</label><select id="format" value={brief.format} onChange={event => setBrief({ ...brief, format: event.target.value as Brief['format'] })}><option value="">Ask me next</option><option value="in-person">In person</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option></select></div></div>
        <div className="brief-field"><label htmlFor="constraints">Anything to keep in mind? <span className="optional-label">Optional</span></label><textarea id="constraints" rows={2} value={brief.constraints} maxLength={1600} onChange={event => setBrief({ ...brief, constraints: event.target.value })} /></div>
        {editRunId && <div className="brief-field"><label htmlFor="edit-feedback">What should change? <span className="optional-label">Optional</span></label><textarea id="edit-feedback" rows={3} value={editFeedback} maxLength={2000} onChange={event => setEditFeedback(event.target.value)} /><span className="field-hint">Add direction for the update. The brief and selected materials below are used for the new version.</span></div>}
      </fieldset>
      <MaterialInput key={workshopDraftKey(editRunId)} preparationLabel={editRunId ? 'Prepare again' : 'Prepare workshop'} replaceExamplesOnAdd={!editRunId} examples={examples} selected={selectedMaterials} textDraft={materialTextDraft} disabled={Boolean(locked)} onChange={setSelectedMaterials} onTextDraftChange={setMaterialTextDraft} onRead={setSelectedMaterial} onBusyChange={setMaterialBusy} />
      {run && !editRunId && <p className="new-run-note" id="new-run-note">Prepares a fresh workshop from this brief, without using the current pack. Saved workshops remain available under Your workshops.</p>}
      <div className="prepare-action"><button type="submit" className="primary-button prepare-button" disabled={locked || pendingMaterialText || !config?.ready || Boolean(editRunId && modeMismatch) || selectedMaterials.length === 0} aria-describedby={run && !editRunId ? 'new-run-note' : undefined}><span>{loading ? 'Loading workspace…' : materialBusy ? 'Reading material…' : editRunId ? 'Prepare again' : 'Prepare workshop'}</span><Arrow /></button><span className="form-footnote">{pendingMaterialText ? 'Add or discard the pasted text first.' : brief.format ? 'Review the result before using it.' : 'The agent will ask for the format next.'}</span></div>
    </form>
  </section>;

  const revisionSummary = run && !starting && <RevisionSummary run={run} original={revisionOriginal} navigationDisabled={Boolean(locked)} openingPrevious={openingId === run.parentRunId} onOpenPrevious={id => { void openRecentWorkshop(id).catch(() => {}); }} />;
  const resultPanel = <div className="result-column" ref={resultRef}>
    <section className={`pack-panel ${!run?.pack || starting ? 'without-pack' : ''} ${complete ? 'pack-complete' : ''}`} aria-labelledby={complete ? 'result-heading' : 'pack-heading'} aria-busy={running}>
      {!complete && <div className="section-heading pack-heading"><h2 id="pack-heading" ref={resultHeadingRef} tabIndex={-1}>Agent’s work</h2><span className="pack-status">{awaitingAnswer ? 'Your answer needed' : running ? 'In preparation' : run?.status === 'failed' ? 'Preparation stopped' : 'Saved progress'}</span></div>}
      {!complete && <AgentWork run={run} starting={starting} busy={busy} inProgress={running} materials={runMaterials} onRead={setSelectedMaterial}>
        {run && !starting && !modeMismatch && <ClarificationPrompt key={run.id} run={run} busy={busy} headingRef={questionRef} onContinue={answer => void resume(answer)} />}
        {run && !busy && run.status === 'ready' && !modeMismatch && <div className="resume-panel"><p>This saved run is ready to continue.</p><button type="button" className="primary-button" onClick={() => void resume()}>Resume preparation<Arrow small /></button></div>}
      </AgentWork>}
      {run?.pack && !starting ? <>
        {!complete && <><div className="draft-so-far"><h3>Draft so far</h3><span>Draft {run.revision} · Provisional until checks finish</span></div><div className="pack-title"><h3><GeneratedProse text={run.pack.title} /></h3><p><CitedText text={run.pack.outcome} materials={runMaterials} onRead={setSelectedMaterial} /></p></div></>}
        {complete && <div className="result-summary"><h2 id="result-heading">Your workshop pack</h2><span className="work-label">Workshop goal</span><p className="pack-outcome"><CitedText text={run.pack.outcome} materials={runMaterials} onRead={setSelectedMaterial} /></p></div>}
        {run.copiedFrom && <div className="content-review-note"><p>Copied from <GeneratedProse text={run.copiedFrom.title} />. Content and checks were copied from that saved version; no new preparation was run.</p></div>}
        {revisionSummary}
        <div className="validation-bar"><span className={`validation-result ${run.validation?.valid ? 'passed' : 'pending'}`}><span aria-hidden="true">{run.validation?.valid ? <CircleCheck size={12} /> : <CircleDot size={12} />}</span>{run.validation?.valid ? 'Timing & reference checks passed' : run.validation ? 'Correction needed' : 'Awaiting checks'}</span><span>{totalMinutes} / {run.brief.durationMinutes} min</span>{run.revision > 0 && <span>Draft {run.revision}</span>}</div>
        {run.validation && !run.validation.valid && <ul className="validation-issues">{run.validation.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
        <ContentReview run={run} />
        {run.clarificationResponse && <div className="saved-clarification"><strong>Additional context you supplied</strong><p>{run.clarificationResponse.question}</p><blockquote>{run.clarificationResponse.answer}</blockquote></div>}
        <div className="pack-tabs" role="tablist" aria-label="Workshop pack sections">{(['agenda', 'exercise', 'notes', 'sources'] as PackTab[]).map(item => <button type="button" role="tab" id={`tab-${item}`} aria-controls={`panel-${item}`} aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={event => {
          const tabs: PackTab[] = ['agenda', 'exercise', 'notes', 'sources'];
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (tabs.indexOf(item) + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
            setTab(tabs[next]); document.getElementById(`tab-${tabs[next]}`)?.focus();
          }
        }} key={item}>{item === 'notes' ? 'Facilitator notes' : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <div key={tab} className="pack-tab-content" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}><PackContent pack={run.pack} tab={tab} run={run} materials={runMaterials} onRead={setSelectedMaterial} /></div>
      </> : <>{revisionSummary}{run?.status === 'failed' ? <div className="draft-waiting"><h3>{run.parentRunId ? 'No draft saved for this revision' : 'No workshop saved'}</h3><p>{run.parentRunId ? 'Open the previous version to review it or try your feedback again.' : 'Choose Back to workshops, then New workshop to try again.'}</p></div> : <div className="draft-waiting"><p>No draft returned yet. It will appear here when available.</p></div>}</>}
    </section>
    {run && !starting && !complete && <AnimatedDetails className="activity-disclosure" summary={<><span><Workflow size={16} aria-hidden="true" />Tool inputs and results <span className="count">{run.events.length}</span></span><Plus size={14} aria-hidden="true" /></>}><Activity run={run} busy={Boolean(running)} /></AnimatedDetails>}
    {complete && run && <section className="export-panel" id="export-workshop" aria-labelledby="export-heading">
      <div className="export-handoff"><div><h2 id="export-heading">Take this workshop with you</h2><p>Review the sections above. Use PDF to share or print, or Word to edit.</p></div><div className="export-actions"><a className="primary-button" href={`/api/runs/${encodeURIComponent(run.id)}/download?format=pdf`} download><DownloadIcon />Download PDF</a><a className="primary-button" href={`/api/runs/${encodeURIComponent(run.id)}/download?format=docx`} download><DownloadIcon />Download Word</a></div></div>
      <AnimatedDetails key={run.id} className="run-record" summary={<><span><Workflow size={15} aria-hidden="true" />Run record <span className="record-hint">Steps, checks and corrections</span></span><Plus size={14} aria-hidden="true" /></>}>
        <AgentWork run={run} starting={false} busy={false} materials={runMaterials} onRead={setSelectedMaterial} history />
        <div className="record-download"><p>Other formats: Markdown for plain text, JSON for the full run record.</p><div className="record-format-links"><a className="secondary-button" href={`/api/runs/${encodeURIComponent(run.id)}/download?format=md`} download><DownloadIcon />Download Markdown</a><a className="secondary-button" href={`/api/runs/${encodeURIComponent(run.id)}/download?format=json`} download><DownloadIcon />Download JSON</a></div></div><Activity run={run} busy={false} />
      </AnimatedDetails>
    </section>}
  </div>;

  const reviewing = complete && view === 'workshop';
  const stage = showBrief && !running ? 0 : reviewing ? 2 : 1;
  const displayedBrief = showBrief ? brief : run?.brief ?? brief;
  return <main className="motion-ui" data-ready={!loading}>
    <header className="site-header"><a className="brand" href="/" aria-label="Workshop Prep Agent home" onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); returnHome(); } }}><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>workshop<span className="brand-light"> / prep agent</span></span></a><span className="prototype-label"><span />Independent prototype</span></header>
    <div className="page-shell">
      <div className="workspace-view" hidden={showHome}>
      <nav className="workshop-navigation" aria-label="Workshop progress">
        <button type="button" className="text-button workshop-home-link" onClick={returnHome} disabled={Boolean(navigationLocked)}><ArrowLeft size={15} aria-hidden="true" />Back to workshops</button>
        <ol className="workshop-stages">{['Workshop brief', 'Preparation', 'Workshop pack'].map((label, index) => {
          const content = <><span className="workshop-stage-number" aria-hidden="true">{stage > index ? <CircleCheck size={15} /> : index + 1}</span>{label}</>;
          const openStep = index === 0 && !showBrief && canEditWorkshop(run)
            ? () => { if (run) void editExistingWorkshop(run.id).catch(() => {}); }
            : index === 2 && showBrief && editRunId && run?.id === editRunId && canEditWorkshop(run)
              ? () => { void openRecentWorkshop(editRunId).catch(() => {}); }
              : undefined;
          return <li key={label} aria-current={stage === index ? 'step' : undefined} className={stage > index ? 'stage-complete' : undefined}>{openStep ? <button type="button" className="workshop-stage-action" disabled={Boolean(locked)} onClick={openStep}>{content}</button> : content}</li>;
        })}</ol>
      </nav>
      <section className={`page-intro ${reviewing ? 'review-intro' : ''}`}>
        <div className="page-heading-copy"><p className="runtime-note">{isTest ? <FlaskConical size={13} aria-hidden="true" /> : <Workflow size={13} aria-hidden="true" />}<span>{loading ? 'Loading workspace…' : isTest ? 'Demo test · no live model' : config?.ready ? 'Live AI preparation' : 'Preparation unavailable'}</span></p>
          <h1 id="workshop-title" ref={reviewing ? resultHeadingRef : showBrief && !running ? briefHeadingRef : undefined} tabIndex={reviewing || showBrief && !running ? -1 : undefined}>{reviewing && run?.pack ? <GeneratedProse text={run.displayName || run.pack.title} /> : reviewing ? 'Your workshop' : showBrief && !running ? editRunId ? 'Edit workshop brief' : 'Workshop brief' : run?.status === 'failed' && !running ? 'Preparation stopped' : 'Preparing your workshop'}</h1>
          {showBrief && !running ? <p className="intro-copy">Set the audience and outcome, then add the materials the agent should use.</p> : <p className="workshop-context"><span>{displayedBrief.audience}</span><span>{displayedBrief.durationMinutes} min · {displayedBrief.format ? formatNames[displayedBrief.format] : 'Format to confirm'}</span></p>}
        </div>
        {!showBrief && canEditWorkshop(run) && <button type="button" className="secondary-button edit-workshop-button" disabled={Boolean(locked)} onClick={() => { if (run) void editExistingWorkshop(run.id).catch(() => {}); }}><PenLine size={15} aria-hidden="true" />Edit brief and sources</button>}
      </section>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      {!showHome && modeMismatch && run && config && <div className="mode-banner live-mode" role="status"><div><strong>New preparations use {config.mode === 'live' ? 'live AI' : 'demo test mode · no live model'}</strong><span>The saved workshop used {run.mode === 'test' ? 'demo test mode' : 'live AI'}.</span></div></div>}
      {!showHome && config && !config.ready && <div className="error-banner" role="alert"><strong>Setup required</strong><ul>{config.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
      {displayedError && <div className="error-banner" role="alert"><strong>{showHome ? 'Workshop could not be opened' : 'Preparation needs attention'}</strong><p>{displayedError}</p>{run?.status !== 'failed' && <button type="button" className="text-button" onClick={() => setError(null)}>Dismiss</button>}</div>}
      <div className="workspace-view" hidden={!showHome}>
        {libraryNotice && <div className="workshop-library-notice" role="status"><CircleCheck size={17} aria-hidden="true" /><span>{libraryNotice}</span><button type="button" className="text-button" onClick={() => setLibraryNotice(null)}>Dismiss</button></div>}
        <WorkshopHome runs={recentRuns.map(item => ({ ...cardDetails[item.id], ...item }))} loading={loading} disabled={Boolean(navigationLocked)} openingId={openingId} actionId={managementBusy ? workshopAction?.id : null} continuingBrief={newDraftAvailable} onContinueBrief={changeBrief} onNewWorkshop={changeBrief} onOpenWorkshop={id => { void openRecentWorkshop(id).catch(() => {}); }} onRenameWorkshop={id => beginWorkshopAction(id, 'rename')} onDeleteWorkshop={id => beginWorkshopAction(id, 'delete')} onDuplicateWorkshop={id => beginWorkshopAction(id, 'duplicate')} onRemoveWorkshop={removeWorkshopFromBrowser} />
      </div>
      <div className="workspace-flow">
        <div className="workspace-view" hidden={!showBrief || Boolean(running)}>{briefPanel}</div>
        <div className="workspace-view" hidden={showHome || showBrief && !running}>{(run || starting) && resultPanel}</div>
      </div>
      <footer className="site-footer"><span>{showHome ? 'Workshop preparation · Human review required' : `${displayedMaterials.length} ${examplesOnly ? 'example references' : 'selected materials'} · Human review required`}</span><span>Independent prototype · No customer outcomes claimed</span></footer>
    </div>
    <MaterialReader material={selectedMaterial} onClose={() => setSelectedMaterial(null)} fallbackFocusRef={showBrief && !running ? briefHeadingRef : resultHeadingRef} />
    {workshopAction && <WorkshopManagementDialog key={`${workshopAction.kind}-${workshopAction.id}`} action={workshopAction} onClose={() => setWorkshopAction(null)} onBusyChange={setManagementBusy} onRenamed={workshopRenamed} onDeleted={workshopDeleted} onDuplicated={workshopDuplicated} />}
  </main>;
}
