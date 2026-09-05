'use client';

import { ArrowRight, Clock3, Copy, LoaderCircle, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import { workshopFamilyId, type RecentRunSummary } from '@/lib/recent-runs';
import type { Brief } from '@/lib/types';
import { formatGeneratedProse } from './GeneratedProse';

export type WorkshopCardSummary = RecentRunSummary & {
  audience?: string;
  durationMinutes?: number;
  format?: Brief['format'];
  canManage?: boolean;
  canDuplicate?: boolean;
  unavailable?: boolean;
};

const statusLabels: Record<RecentRunSummary['status'], string> = {
  ready: 'Ready to continue',
  running: 'Preparing',
  awaiting_input: 'Answer needed',
  completed: 'Ready for review',
  failed: 'Preparation stopped',
};

const formatLabels: Record<Exclude<Brief['format'], ''>, string> = {
  'in-person': 'In person',
  remote: 'Remote',
  hybrid: 'Hybrid',
};

type WorkshopHomeProps = {
  runs: WorkshopCardSummary[];
  loading: boolean;
  disabled: boolean;
  openingId: string | null;
  actionId?: string | null;
  onNewWorkshop: () => void;
  onOpenWorkshop: (id: string) => void;
  onRenameWorkshop: (id: string) => void;
  onDeleteWorkshop: (id: string) => void;
  onDuplicateWorkshop: (id: string) => void;
  onRemoveWorkshop: (id: string) => void;
  continuingBrief?: boolean;
  onContinueBrief?: () => void;
};

export default function WorkshopHome({ runs, loading, disabled, openingId, actionId, onNewWorkshop, onOpenWorkshop, onRenameWorkshop, onDeleteWorkshop, onDuplicateWorkshop, onRemoveWorkshop, continuingBrief = false, onContinueBrief }: WorkshopHomeProps) {
  const unavailable = disabled || loading || Boolean(openingId) || Boolean(actionId);

  return <section className="workshop-home" aria-labelledby="workshop-home-heading" aria-busy={loading}>
    <header className="workshop-home-heading">
      <div>
        <h1 id="workshop-home-heading" tabIndex={-1}>Your workshops</h1>
        <p>Continue a saved workshop or prepare a new one.</p>
      </div>
    </header>

    {openingId && <p className="sr-only" role="status">Opening the selected workshop.</p>}
    {actionId && <p className="sr-only" role="status">Updating the selected workshop.</p>}
    <ul className={`workshop-home-grid ${!loading && !runs.length ? 'is-empty' : ''}`} aria-label="Workshops">
      <li>
        <button type="button" className="workshop-card workshop-create-card"
          aria-label={continuingBrief ? 'Continue brief' : 'New workshop'}
          disabled={unavailable || (continuingBrief && !onContinueBrief)}
          onClick={continuingBrief ? onContinueBrief : onNewWorkshop}>
          <span className="workshop-create-icon" aria-hidden="true">{continuingBrief ? <Pencil size={24} /> : <Plus size={26} />}</span>
          <span className="workshop-create-title">{continuingBrief ? 'Continue your brief' : 'New workshop'}</span>
          <span className="workshop-create-copy">{continuingBrief ? 'Your brief and materials are still available in this session.' : 'Turn your brief and materials into an agenda, exercise and facilitator notes.'}</span>
          <span className="workshop-create-action">{continuingBrief ? 'Continue brief' : 'Start with a brief'}<ArrowRight size={18} aria-hidden="true" /></span>
        </button>
      </li>
      {loading ? <li className="workshop-home-loading" role="status"><LoaderCircle size={18} className="workshop-history-spinner" aria-hidden="true" />Loading your workshops…</li>
        : runs.map(item => {
          const title = formatGeneratedProse(item.title).replace(/\s+/g, ' ').trim();
          const opening = item.id === openingId;
          const updating = item.id === actionId;
          const audience = item.audience?.trim();
          const durationKnown = typeof item.durationMinutes === 'number' && Number.isFinite(item.durationMinutes) && item.durationMinutes > 0;
          return <li key={workshopFamilyId(item)}>
            <article className={`workshop-card ${item.unavailable ? 'workshop-card-unavailable' : ''}`} aria-labelledby={`workshop-title-${item.id}`}>
              <div className="workshop-card-top">
                <div className="workshop-card-state">
                  <span className={`workshop-card-status ${item.unavailable ? 'unavailable' : item.status}`}>{item.unavailable ? 'Unavailable' : statusLabels[item.status]}</span>
                  {item.revised && <span className="workshop-card-revised">Revised</span>}
                </div>
                <details className="workshop-card-menu" name="workshop-actions"
                  onKeyDown={event => {
                    if (event.key !== 'Escape') return;
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector('summary')?.focus();
                  }}>
                  <summary aria-label={`Actions for ${title}`} aria-disabled={unavailable} tabIndex={unavailable ? -1 : 0}
                    onClick={event => { if (unavailable) event.preventDefault(); }}><MoreHorizontal size={20} aria-hidden="true" /></summary>
                  <div className="workshop-card-menu-actions">
                    {item.canManage === true ? <>
                      <button type="button" disabled={unavailable} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onRenameWorkshop(item.id); }}><Pencil size={15} aria-hidden="true" />Rename</button>
                      <button type="button" className="workshop-card-delete" disabled={unavailable} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onDeleteWorkshop(item.id); }}><Trash2 size={15} aria-hidden="true" />Delete workshop</button>
                    </> : <p className="workshop-card-view-only">View only</p>}
                    {item.canDuplicate && !item.unavailable && <button type="button" disabled={unavailable} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onDuplicateWorkshop(item.id); }}><Copy size={15} aria-hidden="true" />Duplicate</button>}
                    <button type="button" disabled={unavailable} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onRemoveWorkshop(item.id); }}><X size={15} aria-hidden="true" />Remove from this browser</button>
                  </div>
                </details>
              </div>
              <h2 id={`workshop-title-${item.id}`}>{title}</h2>
              <div className="workshop-card-context">
                <p className="workshop-card-audience"><span>Audience</span>{audience || 'Audience unavailable'}</p>
                <p className="workshop-card-session"><Clock3 size={15} aria-hidden="true" /><span>{durationKnown ? `${item.durationMinutes} minutes` : 'Duration unavailable'}</span>{item.format && <span className="workshop-card-format">{formatLabels[item.format]}</span>}</p>
              </div>
              <div className="workshop-card-footer">
                <p>Updated <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></p>
                <button type="button" className="secondary-button workshop-card-open" aria-label={`${item.unavailable ? 'Retry opening' : 'Open'} ${title}`} disabled={unavailable} onClick={() => onOpenWorkshop(item.id)}>
                  {opening ? 'Opening…' : updating ? 'Updating…' : item.unavailable ? 'Retry opening' : 'Open'}{opening || updating ? <LoaderCircle size={16} className="workshop-history-spinner" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
                </button>
              </div>
            </article>
          </li>;
        })}
    </ul>
    {!loading && !runs.length && <p className="workshop-home-empty">Workshops you prepare or open will appear here.</p>}

    <p className="workshop-home-history-note">This library lists workshops opened in this browser.</p>
  </section>;
}
