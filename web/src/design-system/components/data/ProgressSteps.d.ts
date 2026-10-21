import * as React from 'react';

export interface ProgressStep {
  title: string;
  desc?: string;
  status?: 'done' | 'current' | 'todo';
}

export interface ProgressStepsProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: ProgressStep[];
  /** @default "horizontal" */
  orientation?: 'horizontal' | 'vertical';
}

/** Numbered methodology / module stepper for course flows and frameworks. */
export function ProgressSteps(props: ProgressStepsProps): JSX.Element;
