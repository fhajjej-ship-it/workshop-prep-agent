'use client';

import { ArrowRight, FileText } from 'lucide-react';
import type { Material, PublicRun, WorkshopPack } from '@/lib/types';
import GeneratedProse from './GeneratedProse';
import WorkshopText from './WorkshopText';
import SessionTimeline from './SessionTimeline';

export type PackTab = 'agenda' | 'exercise' | 'notes' | 'sources';
const formatNames = { 'in-person': 'In person', remote: 'Remote', hybrid: 'Hybrid' };
function Arrow({ small = false }: { small?: boolean }) {
  return <ArrowRight size={small ? 14 : 18} aria-hidden="true" />;
}

type SourceActions = { materials: Material[]; onRead: (material: Material) => void };

function Sources({ ids, materials, onRead }: { ids: string[] } & SourceActions) {
  return <span className="source-tags">{ids.map(id => {
    const material = materials.find(item => item.id === id);
    return material ? <button type="button" key={id} className="source-tag source-link" data-source-id={id} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }} aria-label={`Read source: ${material.title}`}>{material.title}</button> : <span key={id} className="source-tag" data-source-id={id}>{id}</span>;
  })}</span>;
}

export default function PackContent({ pack, tab, run, materials, onRead }: { pack: WorkshopPack; tab: PackTab; run: PublicRun } & SourceActions) {
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
