// web/frontend/src/components/Modal.tsx
// Shared modal. Replaces the 2 inline modals (report reader and
// confirm-run dialog). The component handles overlay, close
// button, aria attributes, and Escape-to-close. Focus-trap and
// backdrop-click-closes are deliberately deferred to a later a11y
// round; the props API leaves room for them so the call sites
// will not need to change when that work lands.

import { useEffect, type ReactElement, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  // Optional override for the header. The default header is an h2
  // with the title; the report reader modal needs a richer header
  // (eyebrow + bold title), so callers can pass a custom node.
  header?: ReactNode;
  children: ReactNode;
}

export function Modal({ open, onClose, title, header, children }: ModalProps): ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="reader-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="reader-modal">
        <header className="reader-modal-header">
          {header !== undefined ? header : <h2>{title}</h2>}
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
