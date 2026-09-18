// components/Avatar.tsx — 用户头像 fallback (Sprint 3 batch2)
//
// 根据 username hash 生成稳定颜色 + 首字 circle
// 有 src 时显示图片, 否则显示首字

import { useMemo } from 'react';

interface Props {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function Avatar({ name, src, size = 28, className = '' }: Props) {
  const hue = hashHue(name || '?');
  const bg = `hsl(${hue}, 70%, 55%)`;
  const initial = (name || '?').charAt(0).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        className={`avatar ${className}`}
        style={{ width: size, height: size, borderRadius: '50%' }}
      />
    );
  }
  return (
    <span
      className={`avatar ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: 'white',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        fontWeight: 700,
        userSelect: 'none',
        flexShrink: 0,
      }}
      title={name || '?'}
    >
      {initial}
    </span>
  );
}