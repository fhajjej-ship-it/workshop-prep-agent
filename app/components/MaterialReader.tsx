'use client';

import { useEffect, useId, useRef, type RefObject } from 'react';
import { X } from 'lucide-react';
import type { Material } from '@/lib/types';
import '../material-reader.css';

type MaterialReaderProps = {
  material: Material | null;
  onClose: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
};

export default function MaterialReader({ material, onClose, fallbackFocusRef }: MaterialReaderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isOpen = material !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;
    const invokingElement = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (invokingElement?.isConnected) invokingElement.focus({ preventScroll: true });
      else fallbackFocusRef?.current?.focus({ preventScroll: true });
    };
  }, [isOpen, fallbackFocusRef]);

  return <dialog
    ref={dialogRef}
    className="material-reader"
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
  >
    {material && <>
      <header className="material-reader-heading">
        <div>
          <span className="eyebrow">Supplied material</span>
          <h2 id={titleId}>{material.title}</h2>
          <span className="source-tag" data-source-id={material.id}>{material.filename ?? (material.kind === 'example' ? 'Example reference' : 'Source text')}{material.pageCount ? ` · ${material.pageCount} ${material.pageCount === 1 ? 'page' : 'pages'}` : ''}</span>
        </div>
        <button type="button" className="material-reader-close" onClick={onClose} autoFocus aria-label="Close material">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="material-reader-content" role="region" aria-label="Supplied material content" tabIndex={0}>
        {material.content}
      </div>
    </>}
  </dialog>;
}
