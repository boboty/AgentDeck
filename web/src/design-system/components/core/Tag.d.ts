import * as React from 'react';

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Selected / brand-tinted state. @default false */
  active?: boolean;
  /** When provided, renders a × affordance and calls this on click. */
  onRemove?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

/** Pill-shaped topic / keyword chip, lower emphasis than Badge. */
export function Tag(props: TagProps): JSX.Element;
