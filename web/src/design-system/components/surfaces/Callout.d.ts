import * as React from 'react';

export interface CalloutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional bold lead line. */
  title?: string | null;
  /** @default "brand" */
  tone?: 'brand' | 'neutral' | 'warning' | 'risk' | 'info';
  /** Optional leading icon node (unicode glyph or SVG). */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

/** Methodology note / tip / warning block with a left brand keyline. */
export function Callout(props: CalloutProps): JSX.Element;
