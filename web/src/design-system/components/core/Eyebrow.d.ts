import * as React from 'react';

export interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Show the leading brand tick. @default true */
  tick?: boolean;
  /** @default "brand" */
  tone?: 'brand' | 'muted' | 'onDark';
  children?: React.ReactNode;
}

/** All-caps brand kicker label with the signature tick — sits above headings. */
export function Eyebrow(props: EyebrowProps): JSX.Element;
