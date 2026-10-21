import * as React from 'react';

/**
 * Button props.
 * @startingPoint section="Core" subtitle="Buttons — primary, secondary, ghost, dark, soft" viewport="700x150"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. @default "primary" */
  variant?: 'primary' | 'secondary' | 'ghost' | 'dark' | 'soft';
  /** Control height. @default "md" */
  size?: 'sm' | 'md' | 'lg';
  /** Node rendered before the label (e.g. an icon). */
  iconLeft?: React.ReactNode;
  /** Node rendered after the label. */
  iconRight?: React.ReactNode;
  disabled?: boolean;
  /** Stretch to fill the container width. */
  full?: boolean;
  children?: React.ReactNode;
}

/** Primary action control for BenYan AI surfaces. */
export function Button(props: ButtonProps): JSX.Element;
