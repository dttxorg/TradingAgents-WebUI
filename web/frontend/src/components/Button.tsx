// web/frontend/src/components/Button.tsx
// Shared button. Replaces the 13+ duplications of
// <button className="primary|secondary|..." onClick={...}
//   disabled={isSaving}>{icon}{label}</button>
// found in main.tsx. The DOM is byte-equivalent to the inline
// pattern. Loading swaps the icon for a spinner and disables the
// button.

import type { ReactElement, ReactNode, MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps {
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  loading = false,
  disabled = false,
  icon,
  type = 'button',
  onClick,
  children,
}: ButtonProps): ReactElement {
  return (
    <button
      type={type}
      className={variant}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Loader2 className="spin" /> : icon}
      {children}
    </button>
  );
}
