import React from 'react';
import { Badge } from '../core/Badge.jsx';
import { Tag } from '../core/Tag.jsx';

/**
 * BenYan AI — CaseCard
 * Enterprise case-study card: badge + title + summary + KPI metrics + tags.
 * The core unit of "案例卡片" (case cards) and workshop materials.
 */
export function CaseCard({
  industry = '案例',
  tone = 'brand',
  title,
  summary,
  metrics = [],
  tags = [],
  status = null,
  style = {},
  ...rest
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: '22px 24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        overflow: 'hidden',
        transition: 'transform var(--dur-base) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard)',
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
      {...rest}
    >
      <span style={{ position: 'absolute', top: 0, left: 0, height: 3, width: 56, background: 'var(--grad-brand)' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Badge tone={tone}>{industry}</Badge>
        {status ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', letterSpacing: '.04em' }}>{status}</span> : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--fw-bold)', fontSize: 'var(--text-xl)', lineHeight: 1.25, color: 'var(--text-strong)', margin: 0 }}>{title}</h3>
        {summary ? <p style={{ fontSize: 'var(--text-sm)', lineHeight: 1.65, color: 'var(--text-muted)', margin: 0 }}>{summary}</p> : null}
      </div>

      {metrics.length ? (
        <div style={{ display: 'flex', gap: 22, padding: '12px 0 2px', borderTop: '1px solid var(--border-subtle)' }}>
          {metrics.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--fw-semibold)', fontSize: 'var(--text-2xl)', color: 'var(--brand-strong)', letterSpacing: '-.02em', lineHeight: 1 }}>{m.value}</span>
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', letterSpacing: '.02em' }}>{m.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {tags.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {tags.map((t, i) => <Tag key={i}>{t}</Tag>)}
        </div>
      ) : null}
    </div>
  );
}
