// admin 共享小工具（时间格式化等，Hermes 无 Intl 时安全）
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 开赛时间 + 24h 内倒计时提示 */
export function fmtKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = d.getTime() - Date.now();
  const diffH = diffMs / 3600000;
  const base = fmtTime(iso);
  if (diffMs > 0 && diffH < 24) {
    const h = Math.floor(diffH);
    const m = Math.floor((diffH - h) * 60);
    return `${base}（${h > 0 ? h + '时' : ''}${m > 0 ? m + '分' : ''}后）`;
  }
  return base;
}

export const SPORT_EMOJI: Record<string, string> = {
  soccer: '⚽', basketball: '🏀', tennis: '🎾', baseball: '⚾',
  american_football: '🏈', hockey: '🏒', mma: '🥊', cricket: '🏏', esports: '🎮',
};

export function sportLabel(s: string): string {
  return `${SPORT_EMOJI[s] ?? '🏆'} ${s === 'other' ? '其他' : s}`;
}
