'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { PublicRun } from '@/lib/types';

export type WorkshopAction = { id: string; title: string; kind: 'rename' | 'delete' | 'duplicate' };
type Props = {
  action: WorkshopAction;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onRenamed: (run: PublicRun) => void;
  onDeleted: (id: string) => void;
  onDuplicated: (run: PublicRun) => void;
};

async function request<T>(id: string, init?: RequestInit, suffix = ''): Promise<T> {
  const response = await fetch(`/api/runs/${encodeURIComponent(id)}${suffix}`, {
    ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || 'The saved workshop could not be updated. Please try again.');
  return data as T;
}

function actionName(title: string, kind: WorkshopAction['kind']) {
  const suffix = kind === 'duplicate' ? ' (copy)' : '';
  return title.trim().slice(0, 180 - suffix.length).trimEnd() + suffix;
}

export default function WorkshopManagementDialog({ action, onClose, onBusyChange, onRenamed, onDeleted, onDuplicated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(() => actionName(action.title, action.kind));
  const nameEditedRef = useRef(false);
  const [saved, setSaved] = useState<PublicRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const rename = action.kind === 'rename';
  const duplicate = action.kind === 'duplicate';
  const namedAction = rename || duplicate;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const invokingElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (invokingElement?.isConnected && invokingElement.getClientRects().length) invokingElement.focus({ preventScroll: true });
      else document.getElementById('workshop-home-heading')?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSaved(null);
    setError(null);
    void request<{ run: PublicRun; canManage: boolean }>(action.id).then(data => {
      if (!active) return;
      if (!duplicate && !data.canManage) throw new Error('This browser cannot rename or delete this workshop.');
      if (data.run.status === 'running') throw new Error('This workshop is still being prepared. Wait for it to finish before changing it.');
      if (duplicate && (!data.run.pack || !['completed', 'failed'].includes(data.run.status))) throw new Error('Only a finished or stopped workshop with a saved pack can be duplicated.');
      setSaved(data.run);
      if (reload === 0 && !nameEditedRef.current) setName(actionName(data.run.displayName || data.run.pack?.title || data.run.brief.objective || action.title, action.kind));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'The workshop could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [action.id, action.title, action.kind, duplicate, reload]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!saved || savingRef.current || (namedAction && !name.trim())) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    onBusyChange(true);
    try {
      if (duplicate) {
        const data = await request<{ run: PublicRun; canManage: true }>(action.id, { method: 'POST', body: JSON.stringify({ displayName: name.trim(), version: saved.version }) }, '/duplicate');
        onDuplicated(data.run);
      } else if (rename) {
        const data = await request<{ run: PublicRun }>(action.id, { method: 'PATCH', body: JSON.stringify({ displayName: name.trim(), version: saved.version }) });
        onRenamed(data.run);
      } else {
        const data = await request<{ deleted: boolean }>(action.id, { method: 'DELETE', body: JSON.stringify({ version: saved.version }) });
        if (data.deleted !== true) throw new Error('Deletion was not confirmed. The workshop remains in your library.');
        onDeleted(action.id);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The workshop could not be updated.');
      // Require a fresh record and another explicit confirmation after any failed mutation.
      setSaved(null);
    } finally {
      savingRef.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  }

  return <dialog ref={dialogRef} className="workshop-management-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); if (!savingRef.current) onClose(); }}>
    <form onSubmit={submit} aria-busy={loading || saving}>
      <span className="eyebrow">Your workshops</span>
      <h2 id={titleId}>{duplicate ? 'Duplicate workshop' : rename ? 'Rename workshop' : 'Delete workshop?'}</h2>
      <p className="workshop-management-name">{saved?.displayName || saved?.pack?.title || action.title}</p>
      <p id={descriptionId}>{duplicate ? 'Creates a separate workshop from this saved pack and its materials. Choose a name for your copy.' : rename ? 'Changes the name shown in your library. The workshop content stays the same.' : 'Permanently deletes this saved workshop and its saved materials. Separate revisions and downloaded files remain. This cannot be undone.'}</p>
      {namedAction && <div className="workshop-management-field"><label htmlFor={`${titleId}-name`}>{duplicate ? 'Copy name' : 'Workshop name'}</label><input id={`${titleId}-name`} autoFocus value={name} onChange={event => { nameEditedRef.current = true; setName(event.target.value); }} maxLength={180} required disabled={saving} /></div>}
      {loading && <p className="workshop-management-loading" role="status"><LoaderCircle size={16} className="workshop-history-spinner" aria-hidden="true" />Loading the saved workshop…</p>}
      {error && <div className="workshop-management-error" role="alert"><p>{error}</p><button type="button" className="text-button" onClick={() => setReload(value => value + 1)} disabled={saving}>Reload saved workshop</button></div>}
      <div className="workshop-management-buttons">
        <button type="button" className="secondary-button" onClick={onClose} disabled={saving} autoFocus={!namedAction}>Cancel</button>
        <button type="submit" className={namedAction ? 'primary-button' : 'workshop-delete-button'} disabled={!saved || loading || saving || (namedAction && !name.trim())}>
          {saving ? <><LoaderCircle size={16} className="workshop-history-spinner" aria-hidden="true" />{duplicate ? 'Creating copy…' : rename ? 'Saving…' : 'Deleting…'}</> : duplicate ? 'Create copy' : rename ? 'Save name' : 'Delete workshop'}
        </button>
      </div>
    </form>
  </dialog>;
}
