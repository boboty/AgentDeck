import * as React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — initials are derived when no image is given. */
  name?: string;
  /** Image URL. Falls back to initials when omitted. */
  src?: string | null;
  /** Diameter in px. @default 40 */
  size?: number;
  /** @default "brand" */
  tone?: 'brand' | 'ink' | 'soft';
}

/** Circular initials / image avatar for instructors and participants. */
export function Avatar(props: AvatarProps): JSX.Element;
