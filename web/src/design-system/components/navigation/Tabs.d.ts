import * as React from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  /** Optional count chip. */
  badge?: string | number;
}

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: TabItem[];
  /** Controlled active id. */
  value?: string | null;
  /** Uncontrolled initial id. */
  defaultValue?: string | null;
  onChange?: (id: string) => void;
}

/** Underline-style tab bar for switching content views. */
export function Tabs(props: TabsProps): JSX.Element;
