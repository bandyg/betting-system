// components/LeagueChip.tsx — 联赛彩色 chip (Sprint 3 #6)
//
// 根据 league 名字 hash 生成稳定的颜色，每个联赛一个独特的视觉 chip
// 圆角矩形 + 首字彩色背景 + league 名称
//
// 用法: <LeagueChip league="KUXLeague" size="sm" />

interface Props {
  league: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

// Hash 字符串 -> HSL 色相 (稳定 + 分布均匀)
function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

const SPORT_EMOJI: Record<string, string> = {
  soccer: '⚽', basketball: '🏀', tennis: '🎾', baseball: '⚾',
  american_football: '🏈', hockey: '🏒',
};

export function LeagueChip({ league, size = 'sm', className = '' }: Props) {
  const hue = hashHue(league || 'unknown');
  const bg = `hsl(${hue}, 70%, 92%)`;
  const fg = `hsl(${hue}, 60%, 30%)`;
  const border = `hsl(${hue}, 50%, 75%)`;
  const initial = (league || '?').charAt(0).toUpperCase();
  // 推算 sport emoji (league 可能含 sport 信息; fallback 用 league 第一字)
  const lower = (league || '').toLowerCase();
  let emoji = '🏆';
  for (const [k, v] of Object.entries(SPORT_EMOJI)) {
    if (lower.includes(k)) { emoji = v; break; }
  }
  return (
    <span
      className={`league-chip lc-${size} ${className}`}
      style={{ background: bg, color: fg, borderColor: border }}
      title={league}
    >
      <span className="lc-circle" style={{ background: fg, color: bg }}>{initial}</span>
      <span className="lc-emoji" aria-hidden>{emoji}</span>
      <span className="lc-name">{league}</span>
    </span>
  );
}