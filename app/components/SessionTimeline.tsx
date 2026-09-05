'use client';

import { useId, useState, type CSSProperties } from 'react';
import type { WorkshopPack } from '@/lib/types';
import GeneratedProse, { formatGeneratedProse } from './GeneratedProse';

export default function SessionTimeline({ agenda }: { agenda: WorkshopPack['agenda'] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const captionId = useId();
  if (!agenda.length || agenda.some(item => item.minutes <= 0)) return null;

  let elapsed = 0;
  const schedule = agenda.map(item => {
    const start = elapsed;
    elapsed += item.minutes;
    return { ...item, start, end: elapsed };
  });
  const selected = schedule[selectedIndex] ?? schedule[0];
  const activeIndex = selectedIndex < schedule.length ? selectedIndex : 0;
  // Give the shortest activity room for its duration without changing any proportions.
  const minimumWidth = elapsed / Math.min(...schedule.map(item => item.minutes)) * 72;
  const minute = (value: number) => String(value).padStart(2, '0');

  return <div className="session-timeline">
    <div className="timeline-viewport">
      <div className="timeline-track" style={{ '--timeline-min-width': `${minimumWidth}px` } as CSSProperties}>
        <div className="agenda-strip" role="group" aria-label="Session timeline activities">
          {schedule.map((item, index) => <button
            type="button" key={`${index}-${item.title}`} className={`agenda-segment segment-${index % 5}`}
            style={{ width: `${item.minutes / elapsed * 100}%`, animationDelay: `${index * 750}ms` }}
            aria-label={`${formatGeneratedProse(item.title).replace(/\s+/g, ' ').trim()}, ${item.minutes} minutes, from ${item.start} to ${item.end} elapsed minutes`}
            aria-pressed={activeIndex === index} aria-controls={captionId}
            onFocus={() => setSelectedIndex(index)} onClick={() => setSelectedIndex(index)}
          ><span aria-hidden="true">{minute(index + 1)}</span><strong aria-hidden="true">{item.minutes}<small>m</small></strong></button>)}
        </div>
        <div className="timeline-ruler" aria-hidden="true">
          {schedule.map((item, index) => <span key={index} className={index === 0 ? 'timeline-tick-first' : undefined} style={{ left: `${item.start / elapsed * 100}%` }}>{minute(item.start)}</span>)}
          <span className="timeline-tick-last" style={{ left: '100%' }}>{minute(elapsed)}</span>
        </div>
      </div>
    </div>
    <p className="timeline-scale-label">Elapsed minutes</p>
    <div id={captionId} className="timeline-caption" aria-live="polite" aria-atomic="true">
      <span className="timeline-caption-label">Selected activity</span>
      <h3><span className={`agenda-marker segment-${activeIndex % 5}`} aria-hidden="true" /><GeneratedProse text={selected.title} /></h3>
    </div>
  </div>;
}
