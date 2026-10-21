import React from 'react';

/**
 * BenYan AI — Callout
 * Methodology note / tip / warning block. Left brand keyline, soft tint.
 */
export function Callout({ children, title = null, tone = 'brand', icon = null, style = {}, ...rest }) {
  const tones = {
    brand:   { bg: 'var(--surface-brand-soft)', bar: 'var(--brand)', fg: 'var(--emerald-900)' },
    neutral: { bg: 'var(--surface-sunken)', bar: 'var(--ink-400)', fg: 'var(--ink-800)' },
    warning: { bg: 'var(--amber-100)', bar: 'var(--amber-500)', fg: '#6b4a09' },
    risk:    { bg: 'var(--rose-100)', bar: 'var(--rose-500)', fg: '#71221b' },
    info:    { bg: 'var(--blue-100)', bar: 'var(--blue-500)', fg: '#1d3f59' },
  };
  const t = tones[tone] || tones.brand;
  return (
    <div
      style={{
        display: 'flex',
        gap: 13,
        background: t.bg,
        borderLeft: `3px solid ${t.bar}`,
        borderRadius: '0 var(--radius-md) var(--radius-md) 0',
        padding: '14px 18px',
        ...style,
      }}
      {...rest}
    >
      {icon ? <span style={{ fontSize: '1.15em', lineHeight: 1.5, color: t.bar, flex: 'none' }}>{icon}</span> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {title ? <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 'var(--fw-semibold)', fontSize: 'var(--text-sm)', color: t.fg }}>{title}</div> : null}
        <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6, color: t.fg, opacity: 0.92 }}>{children}</div>
      </div>
    </div>
  );
}
