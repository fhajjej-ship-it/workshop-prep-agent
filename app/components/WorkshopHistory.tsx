'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronRight, List, LoaderCircle, X } from 'lucide-react';
import type { RecentRunSummary } from '@/lib/recent-runs';
import { formatGeneratedProse } from './GeneratedProse';

const statusLabels: Record<RecentRunSummary['status'], string> = {
  ready: 'Ready to continue',
  running: 'Preparing',
  awaiting_input: 'Answer needed',
  completed: 'Ready for review',
  failed: 'Preparation stopped',
};

type HistoryListProps = {
  runs: RecentRunSummary[];
  currentRunId?: string;
  openingId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
};

export function WorkshopHistoryList({ runs, currentRunId, openingId, disabled, onSelect }: HistoryListProps) {
  return <ul className="workshop-history-list" aria-label="Recently opened workshops">
    {runs.map(item => {
      const current = item.id === currentRunId;
      const opening = item.id === openingId;
      return <li key={item.id}>
        <button type="button" className="workshop-history-row" aria-current={current ? 'page' : undefined}
          disabled={disabled} onClick={() => onSelect(item.id)}>
          <span className="workshop-history-title">{formatGeneratedProse(item.title).replace(/\s+/g, ' ').trim()}</span>
          <span className="workshop-history-indicator" aria-hidden="true">{opening ? <LoaderCircle size={20} className="workshop-history-spinner" /> : current ? <Check size={20} /> : <ChevronRight size={20} />}</span>
          <span className="workshop-history-updated">Updated <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></span>
          <span className="workshop-history-meta">
            {current && <span className="workshop-history-tag current">Current</span>}
            {item.revised && <span className="workshop-history-tag revised">Revised</span>}
            <span className={`workshop-history-status ${item.status}`}>{opening ? 'Opening…' : statusLabels[item.status]}</span>
          </span>
        </button>
      </li>;
    })}
  </ul>;
}

type WorkshopHistoryProps = {
  runs: RecentRunSummary[];
  currentRunId?: string;
  disabled: boolean;
  disabledReason?: string;
  onOpenWorkshop: (id: string) => Promise<void>;
  onWorkshopOpened: () => void;
};

export default function WorkshopHistory({ runs, currentRunId, disabled, disabledReason, onOpenWorkshop, onWorkshopOpened }: WorkshopHistoryProps) {
  const [open, setOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogId = useId();
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function close() {
    dialogRef.current?.close();
    setOpen(false);
    if (triggerRef.current && !triggerRef.current.disabled) triggerRef.current.focus({ preventScroll: true });
    else requestAnimationFrame(onWorkshopOpened);
  }

  async function selectWorkshop(id: string) {
    if (disabled || selectingRef.current) return;
    if (id === currentRunId) { close(); return; }
    selectingRef.current = true;
    setOpeningId(id);
    setError(null);
    try {
      await onOpenWorkshop(id);
      close();
      requestAnimationFrame(onWorkshopOpened);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'This workshop could not be opened. Please try again.');
    } finally {
      selectingRef.current = false;
      setOpeningId(null);
    }
  }

  return <>
    <button ref={triggerRef} type="button" className="secondary-button workshop-history-trigger"
      disabled={disabled} title={disabled ? disabledReason : undefined}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId}
      onClick={() => { setError(null); setOpen(true); }}>
      <List size={16} aria-hidden="true" />Your workshops
    </button>
    <dialog ref={dialogRef} id={dialogId} className="workshop-history" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); close(); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="workshop-history-panel">
        <header className="workshop-history-heading">
          <h2 id={titleId}>Your workshops</h2>
          <button type="button" className="workshop-history-close" aria-label="Close workshops" onClick={close} autoFocus><X size={22} aria-hidden="true" /></button>
        </header>
        <div className="workshop-history-scroll">
          <p className="workshop-history-intro">Recently opened on this browser</p>
          {error && <p className="workshop-history-error" role="alert">{error}</p>}
          {openingId && <p className="sr-only" role="status">Opening the selected workshop.</p>}
          {runs.length ? <WorkshopHistoryList runs={runs} currentRunId={currentRunId} openingId={openingId} disabled={disabled || Boolean(openingId)} onSelect={id => void selectWorkshop(id)} /> : <p className="workshop-history-empty">Workshops you prepare or open will appear here.</p>}
        </div>
        <footer className="workshop-history-footer">Recent history is saved on this browser.</footer>
      </div>
    </dialog>
  </>;
}
