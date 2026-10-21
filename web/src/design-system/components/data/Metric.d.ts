import * as React from 'react';

export interface MetricProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The headline figure, e.g. "+38%" or "4.2×". */
  value: string;
  /** Short label under the figure. */
  label: string;
  /** Optional secondary caption. */
  caption?: string | null;
  /** Optional delta chip, e.g. "12pp". */
  delta?: string | null;
  /** Delta direction. @default "up" */
  trend?: 'up' | 'down' | 'flat';
  /** @default "left" */
  align?: 'left' | 'center';
  /** Figure size. @default "md" */
  size?: 'sm' | 'md' | 'lg';
}

/** Big KPI figure with label, caption and optional trend delta. */
export function Metric(props: MetricProps): JSX.Element;
