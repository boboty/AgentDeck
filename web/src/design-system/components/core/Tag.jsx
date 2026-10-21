import React from 'react';

/**
 * BenYan AI — Tag
 * Topic / keyword chip. Pill-shaped, low emphasis. Optional removable.
 */
export function Tag({ children, active = false, onRemove = null, style = {}, ...rest }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        background: active ? 'var(--surface-brand-soft)' : 'var(--surface-card)',
        color: active ? 'var(--emerald-800)' : 'var(--text-muted)',
        border: `1px solid ${active ? 'var(--emerald-200)' : 'var(--border-default)'}`,
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--fw-medium)',
        fontSize: 'var(--text-xs)',
        padding: '5px 12px',
        borderRadius: 'var(--radius-pill)',
        lineHeight: 1.3,
        cursor: rest.onClick ? 'pointer' : 'default',
        transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
        ...style,
      }}
      {...rest}
    >
      {children}
      {onRemove ? (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove(e); }}
          style={{ display: 'inline-flex', cursor: 'pointer', color: 'var(--text-faint)', fontSize: '1.1em', lineHeight: 1 }}
        >
          ×
        </span>
      ) : null}
    </span>
  );
}
