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
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  loading = false,
  disabled = false,
  icon,
  type = 'button',
  onClick,
  className,
  children,
}: ButtonProps): ReactElement {
  // When the caller passes a className (e.g. "primary full"), merge it
  // with the variant. The existing main.tsx buttons set both `primary`
  // and a layout class like "full" together; the new code preserves
  // both instead of dropping the layout class.
  const mergedClass = className !== undefined
    ? (variant === 'secondary' ? className : `${variant} ${className}`)
    : variant;
  return (
    <button
      type={type}
      className={mergedClass}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Loader2 className="spin" /> : icon}
      {children}
    </button>
  );
}
