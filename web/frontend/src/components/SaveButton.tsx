// web/frontend/src/components/SaveButton.tsx
// Sugar over <Button> for the 13+ "save" buttons in the app.
// Fixes the variant to "primary" and the icon to a Save glyph so
// call sites don't repeat those props.

import type { ReactElement, ReactNode } from 'react';
import { Save } from 'lucide-react';
import { Button } from './Button';

export interface SaveButtonProps {
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

export function SaveButton(props: SaveButtonProps): ReactElement {
  const { className, ...rest } = props;
  return (
    <Button
      variant="primary"
      icon={<Save />}
      {...(className !== undefined ? { className } : {})}
      {...rest}
    >
      {props.children}
    </Button>
  );
}
