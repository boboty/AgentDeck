import React from 'react';

/**
 * BenYan AI — ProgressSteps
 * Numbered methodology / module stepper. Horizontal or vertical.
 * steps: [{ title, desc?, status? }]  status: 'done' | 'current' | 'todo'
 */
export function ProgressSteps({ steps = [], orientation = 'horizontal', style = {}, ...rest }) {
  const isH = orientation === 'horizontal';

  const node = (st, idx) => {
    const status = st.status || (idx === 0 ? 'current' : 'todo');
    const done = status === 'done';
    const current = status === 'current';
    const bg = done ? 'var(--brand)' : current ? 'var(--ink-800)' : 'var(--surface-card)';
    const fg = done || current ? '#fff' : 'var(--text-faint)';
    const bd = done ? 'var(--brand)' : current ? 'var(--ink-800)' : 'var(--border-default)';
    return (
      <div key={idx} style={{ display: 'flex', flexDirection: isH ? 'column' : 'row', gap: isH ? 12 : 16, alignItems: isH ? 'flex-start' : 'flex-start', flex: isH ? 1 : 'none', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: isH ? 'row' : 'column', alignItems: 'center', gap: 0, flex: 'none' }}>
          <span style={{
            width: 34, height: 34, borderRadius: 999, flex: 'none',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: bg, color: fg, border: `1.5px solid ${bd}`,
            fontFamily: 'var(--font-mono)', fontWeight: 'var(--fw-semibold)', fontSize: 'var(--text-sm)',
            boxShadow: current ? 'var(--ring-brand)' : 'none',
          }}>{done ? '✓' : String(idx + 1).padStart(2, '0')}</span>
          {!isH && idx < steps.length - 1 ? <span style={{ width: 1.5, flex: 1, minHeight: 28, background: 'var(--border-default)', marginTop: 4 }} /> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: isH ? 0 : 22 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: 'var(--text-md)', color: current || done ? 'var(--text-strong)' : 'var(--text-muted)', lineHeight: 1.3 }}>{st.title}</span>
          {st.desc ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.55 }}>{st.desc}</span> : null}
        </div>
      </div>
    );
  };

  if (isH) {
    return (
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, ...style }} {...rest}>
        {steps.map((st, idx) => (
          <React.Fragment key={idx}>
            {node(st, idx)}
            {idx < steps.length - 1 ? <span style={{ height: 1.5, flex: '0 0 28px', alignSelf: 'flex-start', marginTop: 16, background: (st.status === 'done') ? 'var(--brand)' : 'var(--border-default)' }} /> : null}
          </React.Fragment>
        ))}
      </div>
    );
  }
  return <div style={{ display: 'flex', flexDirection: 'column', ...style }} {...rest}>{steps.map(node)}</div>;
}
