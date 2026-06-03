// web/frontend/src/components/Field.tsx
// Shared form field wrapper. Replaces the 40+ duplications of
// <label className="field"><span>{label}</span><input/></label>
// found in main.tsx. The component is a thin wrapper: it does not
// know about <input>, <select>, or <textarea>; the caller supplies
// the control as `children`. The DOM is byte-equivalent to the
// inline pattern it replaces.

import type { ReactElement, ReactNode } from 'react';

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps): ReactElement {
  return (
    <label className="field">
      {label !== undefined && (
        <span>
          {label}
          {required === true && <em className="required"> *</em>}
        </span>
      )}
      {children}
      {hint !== undefined && error === null && <small className="hint">{hint}</small>}
      {error !== null && error !== undefined && <small className="error">{error}</small>}
    </label>
  );
}
