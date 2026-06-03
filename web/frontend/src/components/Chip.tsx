// web/frontend/src/components/Chip.tsx
// Shared chip button. Replaces the 7 occurrences of
// <button type="button" className={cond ? 'chip active' : 'chip'}
//   disabled={...} aria-current={...} onClick={...}>
//   {label}
// </button>
// scattered across settings tabs, language switcher, and view
// switcher. The aria-current prop is exposed because two of the
// seven call sites use it for tab semantics.

import type { ReactElement, ReactNode } from 'react';

export interface ChipProps {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  ariaCurrent?: 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false';
  children: ReactNode;
}

export function Chip({
  active = false,
  disabled = false,
  onClick,
  ariaCurrent,
  children,
}: ChipProps): ReactElement {
  return (
    <button
      type="button"
      className={active ? 'chip active' : 'chip'}
      disabled={disabled}
      aria-current={ariaCurrent}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
