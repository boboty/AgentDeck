import React from 'react';

/**
 * BenYan AI — Tabs
 * Underline-style tab bar. Controlled or uncontrolled.
 * items: [{ id, label, badge? }]
 */
export function Tabs({ items = [], value = null, defaultValue = null, onChange = null, style = {}, ...rest }) {
  const [internal, setInternal] = React.useState(defaultValue ?? (items[0] && items[0].id));
  const active = value != null ? value : internal;
  const select = (id) => { if (value == null) setInternal(id); if (onChange) onChange(id); };

  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-default)', ...style }} {...rest}>
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => select(it.id)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '11px 16px',
              marginBottom: -1,
              fontFamily: 'var(--font-sans)',
              fontWeight: on ? 'var(--fw-semibold)' : 'var(--fw-medium)',
              fontSize: 'var(--text-sm)',
              color: on ? 'var(--text-strong)' : 'var(--text-muted)',
              borderBottom: `2px solid ${on ? 'var(--brand)' : 'transparent'}`,
              transition: 'color var(--dur-fast) var(--ease-standard)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = 'var(--text-body)'; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            {it.label}
            {it.badge != null ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', background: on ? 'var(--surface-brand-soft)' : 'var(--surface-sunken)', color: on ? 'var(--emerald-700)' : 'var(--text-faint)', borderRadius: 'var(--radius-pill)', padding: '1px 7px' }}>{it.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
