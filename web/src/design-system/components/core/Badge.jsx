import React from 'react';

/**
 * BenYan AI — Badge
 * Compact status / category label. Tones map to semantic accents.
 */
export function Badge({ children, tone = 'brand', solid = false, dot = false, style = {}, ...rest }) {
  const tones = {
    brand:   { soft: ['var(--emerald-100)', 'var(--emerald-800)'], solid: ['var(--brand)', '#fff'], dot: 'var(--brand)' },
    neutral: { soft: ['var(--ink-100)', 'var(--ink-700)'], solid: ['var(--ink-700)', '#fff'], dot: 'var(--ink-400)' },
    success: { soft: ['var(--emerald-100)', 'var(--emerald-800)'], solid: ['var(--emerald-600)', '#fff'], dot: 'var(--emerald-500)' },
    warning: { soft: ['var(--amber-100)', 'var(--amber-500)'], solid: ['var(--amber-500)', '#fff'], dot: 'var(--amber-500)' },
    risk:    { soft: ['var(--rose-100)', 'var(--rose-500)'], solid: ['var(--rose-500)', '#fff'], dot: 'var(--rose-500)' },
    info:    { soft: ['var(--blue-100)', 'var(--blue-500)'], solid: ['var(--blue-500)', '#fff'], dot: 'var(--blue-500)' },
  };
  const t = tones[tone] || tones.brand;
  const [bg, fg] = solid ? t.solid : t.soft;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: bg,
        color: fg,
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--fw-semibold)',
        fontSize: 'var(--text-2xs)',
        letterSpacing: '0.02em',
        padding: '3px 9px',
        borderRadius: 'var(--radius-sm)',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {dot ? <span style={{ width: 6, height: 6, borderRadius: 999, background: solid ? 'rgba(255,255,255,.8)' : t.dot }} /> : null}
      {children}
    </span>
  );
}
