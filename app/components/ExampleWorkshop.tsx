'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChevronDown, Download, FileText } from 'lucide-react';
import { EXAMPLE_WORKSHOP_ID, exampleWorkshopMetadata, exampleWorkshopRun } from '@/lib/example-workshop';
import type { Material } from '@/lib/types';
import ContentReview from './ContentReview';
import GeneratedProse from './GeneratedProse';
import MaterialReader from './MaterialReader';
import PackContent, { type PackTab } from './PackContent';
import WorkshopText from './WorkshopText';

const tabs: { id: PackTab; label: string }[] = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'exercise', label: 'Exercise' },
  { id: 'notes', label: 'Facilitator notes' },
  { id: 'sources', label: 'Sources' },
];
const formatNames = { 'in-person': 'In person', remote: 'Remote', hybrid: 'Hybrid' };

export default function ExampleWorkshop() {
  const [tab, setTab] = useState<PackTab>('agenda');
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const run = exampleWorkshopRun;

  return <div className="example-workshop-page">
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Workshop Prep Agent home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>workshop<span className="brand-light"> / prep agent</span></span></Link>
      <span className="prototype-label"><span />Independent prototype</span>
    </header>
    <main className="page-shell example-workshop-shell">
      <nav className="example-workshop-navigation" aria-label="Workshop navigation"><Link href="/" className="example-back-link"><ArrowLeft size={17} aria-hidden="true" />Back to workshops</Link></nav>

      <header className="example-workshop-intro">
        <div className="example-workshop-title">
          <span className="eyebrow">Saved example · Fictional company and materials</span>
          <h1 ref={headingRef} tabIndex={-1}><GeneratedProse text={run.pack.title} /></h1>
          <p className="example-workshop-provenance">{exampleWorkshopMetadata.provenance}</p>
        </div>
        <div className="example-workshop-start"><Link href={`/?view=brief&example=${EXAMPLE_WORKSHOP_ID}`} className="primary-button">Try this example<ArrowRight size={17} aria-hidden="true" /></Link><p>Opens an editable brief.</p></div>
      </header>

      <details className="example-workshop-brief">
        <summary className="example-brief-label"><span>View the original brief</span><span>{run.brief.durationMinutes} minutes{run.brief.format ? ` · ${formatNames[run.brief.format]}` : ''}</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="example-brief-context">
          <p><strong>Audience</strong>{run.brief.audience}</p>
          <p><strong>Objective</strong>{run.brief.objective}</p>
          <details className="example-brief-constraints"><summary>Workshop constraints<ChevronDown size={15} aria-hidden="true" /></summary><p>{run.brief.constraints}</p></details>
        </div>
      </details>

      <section className="pack-panel pack-complete example-saved-pack" aria-labelledby="example-pack-heading">
        <div className="result-summary">
          <h2 id="example-pack-heading">The saved workshop pack</h2>
          <span className="work-label">Intended workshop outcome</span>
          <div className="pack-outcome"><WorkshopText text={run.pack.outcome} materials={run.materials} onRead={setSelectedMaterial} /></div>
        </div>
        <div className="pack-tabs" role="tablist" aria-label="Example workshop pack sections">
          {tabs.map(({ id, label }, index) => <button key={id} type="button" role="tab" id={`example-tab-${id}`} aria-controls={`example-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)} onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
              setTab(tabs[next].id);
              document.getElementById(`example-tab-${tabs[next].id}`)?.focus();
            }}>{label}</button>)}
        </div>
        {tabs.map(({ id }) => <div key={id} className="pack-tab-content" role="tabpanel" id={`example-panel-${id}`} aria-labelledby={`example-tab-${id}`} tabIndex={0} hidden={tab !== id}>
          {tab === id && <PackContent pack={run.pack} tab={id} run={run} materials={run.materials} onRead={setSelectedMaterial} />}
        </div>)}
      </section>

      <details className="example-saved-review"><summary><span>Saved checks and content review</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="example-saved-review-content"><p>These results were recorded with this saved draft. Timing and reference checks {run.validation.valid ? 'passed' : 'need attention'}: {run.validation.totalMinutes} / {run.brief.durationMinutes} minutes.</p><ContentReview run={run} /></div>
      </details>

      <section className="export-panel example-export-panel" aria-labelledby="example-export-heading">
        <div className="export-handoff"><div><h2 id="example-export-heading">Take the example with you</h2><p>Download the saved pack as PDF to read or print, or Word to edit. Fictional example; review before use.</p></div><div className="export-actions"><a className="secondary-button" href="/api/example/download?format=pdf" download><Download size={16} aria-hidden="true" />Download PDF</a><a className="secondary-button" href="/api/example/download?format=docx" download><FileText size={16} aria-hidden="true" />Download Word</a></div></div>
      </section>
      <footer className="site-footer"><span>Workshop Prep Agent · Independent prototype</span><span>Saved example · Generated previously · Draft for human review</span></footer>
    </main>
    <MaterialReader material={selectedMaterial} onClose={() => setSelectedMaterial(null)} fallbackFocusRef={headingRef} />
  </div>;
}
