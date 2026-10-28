/**
 * 时间显示统一约定：
 * - 后端返回的 created_at / publish_at / kickoff_time 一律是 UTC（SQLite `datetime('now')`
 *   或 ISO 字符串），展示前必须转本地时区。此前多处在界面直接截取字符串导致显示成了 UTC。
 * - 开赛时间跨年时要带年份（种子/远期赛程常见明年日期，只显示 "1/1" 会误导）。
 */

/** SQLite UTC "YYYY-MM-DD HH:MM:SS" / ISO → 本地时间。非法输入原样返回。 */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  // "YYYY-MM-DD HH:MM:SS"（SQLite datetime('now') 无时区标记，明确按 UTC 解析）
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value)
    ? `${value.replace(' ', 'T')}${value.length === 16 ? ':00' : ''}Z`
    : value;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 本地 "YYYY-MM-DD HH:mm"（列表/流水通用） */
export function formatLocalDateTime(value: string | null | undefined): string {
  const d = parseUtc(value);
  if (!d) return value ?? '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 本地 "M/D HH:mm"，非当年补年份 "YYYY/M/D HH:mm"（赛事卡片开赛时间） */
export function formatKickoffLocal(iso: string): string {
  const d = parseUtc(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const yearPrefix = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}/`;
  return `${yearPrefix}${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 相对当前时间的开赛倒计时后缀（48h 内才有意义）：" · 2h 15m" */
export function kickoffCountdownSuffix(iso: string, now = Date.now()): string {
  const d = parseUtc(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = d.getTime() - now;
  const diffH = Math.floor(diffMs / 3600000);
  const diffM = Math.floor((diffMs % 3600000) / 60000);
  if (diffH > 0 && diffH < 48) return ` \u00B7 ${diffH}h ${diffM}m`;
  if (diffH === 0 && diffM > 0) return ` \u00B7 ${diffM}m`;
  return '';
}
