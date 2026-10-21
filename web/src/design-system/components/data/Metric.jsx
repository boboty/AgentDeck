import React from 'react';

/**
 * BenYan AI — Metric
 * Big KPI figure with label and optional delta / caption.
 * Mono numerals reinforce the data-credible, methodology tone.
 */
export function Metric({
  value,
  label,
  caption = null,
  delta = null,
  trend = 'up',
  align = 'left',
  size = 'md',
  style = {},
  ...rest
}) {
  const sizes = { sm: 'var(--text-3xl)', md: 'var(--text-4xl)', lg: 'var(--text-5xl)' };
  const trendColor = trend === 'down' ? 'var(--rose-500)' : trend === 'flat' ? 'var(--ink-400)' : 'var(--emerald-600)';
  const arrow = trend === 'down' ? '↓' : trend === 'flat' ? '→' : '↑';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: align === 'center' ? 'center' : 'flex-start', textAlign: align, ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--fw-semibold)', fontSize: sizes[size] || sizes.md, letterSpacing: '-0.02em', color: 'var(--text-strong)', lineHeight: 1 }}>{value}</span>
        {delta ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontFamily: 'var(--font-sans)', fontWeight: 'var(--fw-semibold)', fontSize: 'var(--text-sm)', color: trendColor }}>
            <span>{arrow}</span>{delta}
          </span>
        ) : null}
      </div>
      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 'var(--fw-semibold)', fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>{label}</span>
      {caption ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5 }}>{caption}</span> : null}
    </div>
  );
}
