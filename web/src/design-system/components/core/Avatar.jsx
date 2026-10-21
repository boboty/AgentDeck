import React from 'react';

/**
 * BenYan AI — Avatar
 * Initials or image avatar. Used for instructors, participants, testimonials.
 */
export function Avatar({ name = '', src = null, size = 40, tone = 'brand', style = {}, ...rest }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const tones = {
    brand: ['var(--emerald-100)', 'var(--emerald-800)'],
    ink: ['var(--ink-700)', '#fff'],
    soft: ['var(--ink-100)', 'var(--ink-600)'],
  };
  const [bg, fg] = tones[tone] || tones.brand;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '999px',
        background: src ? 'transparent' : bg,
        color: fg,
        fontFamily: 'var(--font-display)',
        fontWeight: 'var(--fw-bold)',
        fontSize: Math.round(size * 0.38),
        overflow: 'hidden',
        flex: 'none',
        border: '2px solid var(--white)',
        boxShadow: 'var(--shadow-xs)',
        ...style,
      }}
      {...rest}
    >
      {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </span>
  );
}
