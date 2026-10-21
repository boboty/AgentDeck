import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Drop shadow depth. @default "sm" */
  elevation?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
  /** Show the signature top-left brand accent rule. @default false */
  accent?: boolean;
  /** Lift + deepen shadow on hover. @default false */
  interactive?: boolean;
  /** Inner padding in px. @default 24 */
  pad?: number;
  children?: React.ReactNode;
}

/** Base surface container for grouped content. */
export function Card(props: CardProps): JSX.Element;
