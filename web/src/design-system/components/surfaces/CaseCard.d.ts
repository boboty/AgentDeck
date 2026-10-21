import * as React from 'react';

export interface CaseMetric {
  value: string;
  label: string;
}

/**
 * Enterprise case-study card props.
 * @startingPoint section="Surfaces" subtitle="Case study card with KPI metrics" viewport="420x320"
 */
export interface CaseCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Industry / category label shown in the badge. @default "案例" */
  industry?: string;
  /** Badge tone. @default "brand" */
  tone?: 'brand' | 'neutral' | 'success' | 'warning' | 'risk' | 'info';
  title: string;
  summary?: string;
  /** KPI metrics row (value + label). */
  metrics?: CaseMetric[];
  /** Keyword tags. */
  tags?: string[];
  /** Small mono status string, top-right (e.g. "12 周 · 已交付"). */
  status?: string | null;
}

/** Enterprise case-study card — the core "案例卡片" unit for decks and workshops. */
export function CaseCard(props: CaseCardProps): JSX.Element;
