import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic color. @default "brand" */
  tone?: 'brand' | 'neutral' | 'success' | 'warning' | 'risk' | 'info';
  /** Filled instead of soft-tinted. @default false */
  solid?: boolean;
  /** Show a leading status dot. @default false */
  dot?: boolean;
  children?: React.ReactNode;
}

/** Compact status or category label. */
export function Badge(props: BadgeProps): JSX.Element;
