'use client';

import { useId, useRef, useState } from 'react';
import { BookOpen, FileText, LoaderCircle, Plus, Upload, X } from 'lucide-react';
import { MAX_MATERIALS as maximumSources, MAX_MATERIAL_CHARS as maximumCharacters, MAX_TOTAL_MATERIAL_CHARS as maximumTotalCharacters, MAX_PDF_BYTES } from '@/lib/material-input';
import type { Material } from '@/lib/types';
import AnimatedDetails from './AnimatedDetails';

export type MaterialTextDraft = { title: string; content: string };

export default function MaterialInput({ examples, selected, textDraft, disabled, replaceExamplesOnAdd = true, preparationLabel = 'Prepare workshop', onChange, onTextDraftChange, onRead, onBusyChange }: {
  examples: Material[];
  selected: Material[];
  textDraft: MaterialTextDraft;
  disabled: boolean;
  replaceExamplesOnAdd?: boolean;
  preparationLabel?: string;
  onChange: (materials: Material[]) => void;
  onTextDraftChange: (draft: MaterialTextDraft) => void;
  onRead: (material: Material) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const headingId = useId();
  const titleId = useId();
  const contentId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const { title, content } = textDraft;
  const [uploading, setUploading] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(Boolean(title || content));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const isExample = (material: Material) => examples.some(example => example.id === material.id);
  const hasCustom = selected.some(material => !isExample(material));
  const totalCharacters = selected.reduce((total, material) => total + material.content.length, 0);
  const customBase = hasCustom || !replaceExamplesOnAdd ? selected : [];
  const customFull = customBase.length >= maximumSources;
  const pendingText = Boolean(title || content);

  function selectionError(materials: Material[]): string | null {
    if (materials.length > maximumSources) return 'Select up to 3 materials. Remove one before adding another.';
    if (materials.some(material => material.content.length > maximumCharacters)) return 'Each material can contain up to 20,000 characters. Shorten the text and try again.';
    if (materials.reduce((total, material) => total + material.content.length, 0) > maximumTotalCharacters) return 'Your selection exceeds 40,000 characters. Remove or shorten a material.';
    return null;
  }

  function addCustom(material: Material): boolean {
    const next = [...customBase, material];
    const problem = selectionError(next);
    if (problem) { setError(problem); return false; }
    onChange(next);
    setError(null);
    setNotice(`Added ${material.title}.${replaceExamplesOnAdd && !hasCustom && selected.length ? ' The example references were removed.' : ''}`);
    return true;
  }

  function addText() {
    if (!title.trim() || !content.trim()) { setError('Give your text a title and paste its content before adding it.'); return; }
    if (title.trim().length > 180) { setError('Keep the material title within 180 characters.'); return; }
    if (content.trim().length < 20) { setError('Paste at least 20 characters of source text before adding it.'); return; }
    const added = addCustom({ id: `source-${crypto.randomUUID()}`, title: title.trim(), content: content.trim(), kind: 'text' });
    if (added) { onTextDraftChange({ title: '', content: '' }); setPasteOpen(false); }
  }

  function discardText() {
    onTextDraftChange({ title: '', content: '' }); setPasteOpen(false);
    setError(null); setNotice('Unadded text discarded. Your selected materials are unchanged.');
  }

  async function upload(file: File) {
    setError(null); setNotice('');
    if (!/\.(pdf|txt|md)$/i.test(file.name)) { setError('Choose a PDF, TXT or Markdown file.'); return; }
    if (file.size > MAX_PDF_BYTES) { setError('Choose a file no larger than 3 MB.'); return; }
    if (customFull) { setError('Select up to 3 materials. Remove one before uploading another.'); return; }
    setUploading(true); onBusyChange(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/materials/upload', { method: 'POST', body });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'This file could not be read. Try another file or paste its text.');
      if (!result?.material?.content) throw new Error('No readable text was found. Try another file or paste its text.');
      addCustom(result.material as Material);
    } catch (uploadError) {
      setError(`${uploadError instanceof Error ? uploadError.message : 'The file could not be read.'} Your selection is unchanged.`);
    } finally { setUploading(false); onBusyChange(false); }
  }

  function remove(material: Material) {
    onChange(selected.filter(item => item.id !== material.id));
    setError(null); setNotice(`Removed ${material.title}.`);
  }

  function toggleExample(material: Material) {
    if (selected.some(item => item.id === material.id)) { remove(material); return; }
    const next = [...selected, material];
    const problem = selectionError(next);
    if (problem) { setError(problem); return; }
    onChange(next); setError(null); setNotice(`Selected example: ${material.title}.`);
  }

  return <section className="material-input" aria-labelledby={headingId} aria-busy={uploading}>
    <div className="material-input-heading"><h3 id={headingId}><BookOpen size={16} aria-hidden="true" />Materials</h3><span>{selected.length} / {maximumSources} selected</span></div>
    <p className="material-input-help">Add your references or choose examples. Only selected materials are used.</p>
    <fieldset disabled={disabled || uploading}>
      {selected.length ? <ul className="selected-materials">{selected.map(material => <li key={material.id}>
        <FileText size={16} aria-hidden="true" />
        <div><button type="button" className="material-preview" onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }}>{material.title}</button><span className="material-meta">{isExample(material) ? 'Example reference' : material.kind === 'pdf' ? `PDF${material.pageCount ? ` · ${material.pageCount} ${material.pageCount === 1 ? 'page' : 'pages'}` : ''}` : 'Text'} · {material.content.length.toLocaleString()} characters · Ready</span></div>
        <button type="button" className="material-remove" aria-label={`Remove ${material.title}`} onClick={() => remove(material)}><X size={16} aria-hidden="true" /></button>
      </li>)}</ul> : <p className="material-empty">No materials selected. Add a reference or select an example before preparing.</p>}
      <div className="material-add-actions">
        <input ref={fileRef} className="sr-only" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" tabIndex={-1} aria-label="Choose a material file" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file); }} />
        <button type="button" className="secondary-button" disabled={customFull} onClick={() => fileRef.current?.click()}>{uploading ? <LoaderCircle className="work-spinner" size={15} aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />}{uploading ? 'Reading file…' : 'Upload PDF or text'}</button>
        <button type="button" className="text-button material-paste-toggle" disabled={customFull && !pendingText} aria-expanded={pasteOpen} aria-controls={`${contentId}-editor`} onClick={() => setPasteOpen(!pasteOpen)}><Plus size={14} aria-hidden="true" />{pasteOpen ? 'Hide pasted text' : pendingText ? 'Finish pasted text' : 'Paste text'}</button>
      </div>
      {replaceExamplesOnAdd && !hasCustom && selected.length > 0 && <p className="material-input-help">Adding your first material replaces the selected examples.</p>}
      {customFull && <p className="material-input-help">All 3 places are used. Remove a material to add another.</p>}
      <p className="material-input-limits">Text-based PDF, TXT or Markdown · 3 MB per file · PDF up to 20 pages.<br />20,000 characters per material · {totalCharacters.toLocaleString()} / 40,000 selected.</p>
      {pasteOpen && <div className="material-paste-editor" id={`${contentId}-editor`}>
        <label htmlFor={titleId}>Material title</label><input id={titleId} value={title} maxLength={180} placeholder="e.g. Leadership workshop brief" onChange={event => onTextDraftChange({ ...textDraft, title: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />
        <label htmlFor={contentId}>Paste the source text</label><textarea id={contentId} value={content} maxLength={maximumCharacters} rows={6} onChange={event => onTextDraftChange({ ...textDraft, content: event.target.value })} placeholder="Paste the text you want the workshop to use." />
        <div className="material-paste-footer"><span>{content.length.toLocaleString()} / 20,000 characters</span><div><button type="button" className="text-button" onClick={discardText}>Discard text</button><button type="button" className="secondary-button" disabled={customFull} onClick={addText}>Add text<Plus size={14} aria-hidden="true" /></button></div></div>
      </div>}
      <AnimatedDetails className="material-examples" summary={<><span>Choose example references</span><Plus size={14} aria-hidden="true" /></>}>
        <p className="material-input-help">Fictional references for trying the app.</p>
        {examples.map(material => <div className="material-example-row" key={material.id}><label className="material-example-option"><input type="checkbox" checked={selected.some(item => item.id === material.id)} onChange={() => toggleExample(material)} /><span>{material.title}</span></label><button type="button" className="text-button" aria-label={`Preview ${material.title}`} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onRead(material); }}>Preview</button></div>)}
      </AnimatedDetails>
    </fieldset>
    {pendingText && <p className="material-pending-note" role="status">Pasted text has not been added. Add or discard it before preparing the workshop.</p>}
    <div className="material-notice" role="status" aria-live="polite">{uploading ? 'Reading the file. Nothing is sent to AI at this step.' : notice}</div>
    {error && <p className="material-error" role="alert">{error}</p>}
    <p className="material-send-note">Selected content is sent to the AI only when you choose {preparationLabel} in live mode.</p>
  </section>;
}
