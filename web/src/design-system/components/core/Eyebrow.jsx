import React from 'react';

/**
 * BenYan AI — Eyebrow
 * All-caps brand label with the signature leading tick. Sits above titles.
 */
export function Eyebrow({ children, tick = true, tone = 'brand', style = {}, ...rest }) {
  const color = tone === 'muted' ? 'var(--text-muted)' : tone === 'onDark' ? 'var(--emerald-300)' : 'var(--text-brand)';
  const tickColor = tone === 'onDark' ? 'var(--emerald-400)' : 'var(--brand)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--fw-semibold)',
        fontSize: 'var(--text-xs)',
        letterSpacing: 'var(--tracking-wider)',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
      {...rest}
    >
      {tick ? <span style={{ width: 22, height: 2, background: tickColor, flex: 'none' }} /> : null}
      {children}
    </span>
  );
}
