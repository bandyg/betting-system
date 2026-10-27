// provider.ts (P2) — HTTP adapter for the-odds-api (default provider).
// Injectable fetch for unit testing; throws on non-OK for backoff/retry.
import type { TheOddsMatch } from './mapper.js';

// 可用 FEED_API_BASE 指向本地假服务器（测试用），生产默认官方 v4 根路径。
// 每次请求时读取，便于测试在 import 之后再注入 env。
function baseUrl(): string {
  return (process.env.FEED_API_BASE || 'https://api.the-odds-api.com/v4').replace(/\/$/, '');
}

/** 最近一次 provider 响应携带的配额快照（header 缺失字段为 null）。 */
export type QuotaSnapshot = {
  remaining: number | null;
  used: number | null;
  last: number | null;
  updatedAt: string;
};

let lastQuota: QuotaSnapshot | null = null;

/** 读取最近一次响应捕获的配额（无请求则为 null）。 */
export function getLastQuota(): QuotaSnapshot | null {
  return lastQuota;
}

function headerNum(res: Response, name: string): number | null {
  const raw = res.headers.get(name);
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** 每次响应（成功或失败）都刷新配额快照。 */
function captureQuota(res: Response): void {
  lastQuota = {
    remaining: headerNum(res, 'x-requests-remaining'),
    used: headerNum(res, 'x-requests-used'),
    last: headerNum(res, 'x-requests-last'),
    updatedAt: new Date().toISOString(),
  };
}

/** provider 非 2xx 错误：保留 HTTP 状态与 vendor error_code（如 OUT_OF_USAGE_CREDITS）。 */
export class ProviderError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
  }
}

/** the-odds-api `/scores/` payload (P4) — final/live score lines for a sport. */
export interface TheOddsScore {
  id: string;
  sport_key?: string;
  sport_title?: string;
  commence_time?: string;
  home_team: string;
  away_team: string;
  scores: Array<{ name: string; score: string | number }> | null;
  completed: boolean;
}

export interface ProviderClient {
  pendingMatches(
    sportKey: string,
    apiKey: string,
    opts?: { fromIso?: string; toIso?: string },
  ): Promise<TheOddsMatch[]>;
  scores(sportKey: string, apiKey: string, opts?: { daysFrom?: number }): Promise<TheOddsScore[]>;
}

async function toProviderError(res: Response): Promise<ProviderError> {
  const text = await res.text().catch(() => '');
  let code: string | null = null;
  try {
    const body = JSON.parse(text) as { error_code?: unknown };
    if (typeof body.error_code === 'string') code = body.error_code;
  } catch {
    // 非 JSON 错误体 → code 保持 null
  }
  return new ProviderError(res.status, `the-odds-api returned ${res.status}: ${text}`, code);
}

/** daysFrom 固定 1..3，缺省 3（供应商 /scores 只接受近 3 天）。 */
function clampDaysFrom(v: number | undefined): number {
  const n = Math.trunc(Number(v ?? 3));
  if (!Number.isFinite(n)) return 3;
  return Math.min(3, Math.max(1, n));
}

export function createTheOddsClient(fetchImpl: typeof fetch = fetch): ProviderClient {
  return {
    /** Odds for today's + future matches of a sport. oddsFormat=decimal, regions=eu. */
    async pendingMatches(
      sportKey: string,
      apiKey: string,
      opts: { fromIso?: string; toIso?: string } = {},
    ): Promise<TheOddsMatch[]> {
      // the-odds-api 只读 URL query 参数 apiKey（header 无效 → "API key is missing"），故拼进 query
      let url = `${baseUrl()}/sports/${encodeURIComponent(sportKey)}/odds/?regions=eu&markets=h2h,spreads,totals&oddsFormat=decimal&dateFormat=iso&includeLinks=false`;
      // 'upcoming' 萬能端點不受日期过滤，供应商会忽略这两个参数 —— 明确不发送。
      if (sportKey !== 'upcoming' && opts.fromIso) {
        url += `&commenceTimeFrom=${encodeURIComponent(opts.fromIso)}`;
      }
      if (sportKey !== 'upcoming' && opts.toIso) {
        url += `&commenceTimeTo=${encodeURIComponent(opts.toIso)}`;
      }
      url += `&apiKey=${encodeURIComponent(apiKey)}`;
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      captureQuota(res);
      if (!res.ok) throw await toProviderError(res);
      return (await res.json()) as TheOddsMatch[];
    },
    /** Final/live scores for a sport. Key still travels as URL query param. */
    async scores(
      sportKey: string,
      apiKey: string,
      opts: { daysFrom?: number } = {},
    ): Promise<TheOddsScore[]> {
      const daysFrom = clampDaysFrom(opts.daysFrom);
      const url = `${baseUrl()}/sports/${encodeURIComponent(sportKey)}/scores/?daysFrom=${daysFrom}&apiKey=${encodeURIComponent(apiKey)}`;
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      captureQuota(res);
      if (!res.ok) throw await toProviderError(res);
      return (await res.json()) as TheOddsScore[];
    },
  };
}
