// scheduler.ts (P2) — recurring feed loop. Disabled by default until a provider API key is configured.
// env:
//   FEED_ENABLED=1           turn on
//   FEED_PROVIDER=soccer_epl (the-odds-api sport key; default soccer_epl)
//   FEED_API_KEY=...         provider key (the-odds-api / RapidAPI key)
//   FEED_INTERVAL_MIN=10     poll minutes (free-tier friendly, default 10)
import type { Database } from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createTheOddsClient, getLastQuota, ProviderError } from './provider.js';
import { ingestVendorUpdate, ingestScores } from './ingest.js';
import { autoSwitchAll, isAutoMarketEnabled } from './autoMarket.js';

// Feed secrets/knobs live OUTSIDE the repo (so the API key is never committed):
//   ~/.betting-feed.env  →  FEED_API_KEY / FEED_ENABLED / FEED_INTERVAL_MIN / FEED_SPORT_KEY / FEED_PROVIDER
const FEED_ENV = join(homedir(), '.betting-feed.env');

function loadSecretsFile(): Record<string, string> {
  if (!existsSync(FEED_ENV)) return {};
  try {
    const out: Record<string, string> = {};
    for (const raw of readFileSync(FEED_ENV, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

export interface FeedConfig {
  enabled: boolean;
  provider: string;      // vendor tag stored on rows
  apiKey: string;
  intervalMin: number;
  sportKey: string;      // backward compat: first sport key
  sportKeys: string[];   // all sport keys to poll
  windowDays: number;        // 具体联赛 odds 的 commenceTime 窗口（天）
  scoresDaysFrom: number;    // /scores 的 daysFrom（1..3）
  quotaBackoffMin: number;   // OUT_OF_USAGE_CREDITS 后的暂停分钟数
  scoreLookbackDays: number; // resolveScoreKeys 中 scheduled 场次回看天数
}

export function readFeedConfig(env: NodeJS.ProcessEnv = process.env): FeedConfig {
  const s = loadSecretsFile(); // file is fallback; process.env wins
  const enabled = (env.FEED_ENABLED ?? s.FEED_ENABLED) === '1';
  const sportKeyRaw = env.FEED_SPORT_KEYS ?? s.FEED_SPORT_KEYS ?? env.FEED_SPORT_KEY ?? s.FEED_SPORT_KEY ?? 'soccer_epl';
  const sportKeys = sportKeyRaw.split(',').map((k) => k.trim()).filter(Boolean);
  return {
    enabled,
    provider: env.FEED_PROVIDER ?? s.FEED_PROVIDER ?? 'the-odds-api',
    apiKey: env.FEED_API_KEY || s.FEED_API_KEY || '',
    intervalMin: Number(env.FEED_INTERVAL_MIN ?? s.FEED_INTERVAL_MIN ?? '10'),
    sportKey: sportKeys[0],
    sportKeys,
    windowDays: Number(env.FEED_WINDOW_DAYS ?? s.FEED_WINDOW_DAYS ?? '7') || 7,
    scoresDaysFrom: Number(env.FEED_SCORES_DAYS_FROM ?? s.FEED_SCORES_DAYS_FROM ?? '3') || 3,
    quotaBackoffMin: Number(env.FEED_QUOTA_BACKOFF_MIN ?? s.FEED_QUOTA_BACKOFF_MIN ?? '60') || 60,
    scoreLookbackDays: Number(env.FEED_SCORE_LOOKBACK_DAYS ?? s.FEED_SCORE_LOOKBACK_DAYS ?? '3') || 3,
  };
}

/** 手动模式：settings.feed_manual='true' 时调度器每轮跳过拉取（admin 面板开关，无需重启进程） */
export function isManualMode(db: Database): boolean {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'feed_manual'").get() as { value: string } | undefined;
  return row?.value === 'true';
}

/** settings KV upsert（配额状态只用 settings 表，不建迁移）。 */
function upsertSetting(db: Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings(key,value) VALUES(?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(key, value);
}

/** 每轮 poll 后把最近一次响应的配额快照写入 settings（全部 TEXT）。 */
export function persistQuota(db: Database): void {
  const q = getLastQuota();
  if (!q) return;
  const asText = (v: number | null) => (v == null ? '' : String(v));
  upsertSetting(db, 'feed_quota_remaining', asText(q.remaining));
  upsertSetting(db, 'feed_quota_used', asText(q.used));
  upsertSetting(db, 'feed_quota_last', asText(q.last));
  upsertSetting(db, 'feed_quota_updated_at', q.updatedAt);
}

function readSetting(db: Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/** 额度耗尽 → 写冷却截止时间 + 错误码；每次耗尽事件只输出一行日志。 */
function markQuotaExhausted(db: Database, cfg: FeedConfig, code: string): void {
  const now = Date.now();
  const prev = readSetting(db, 'feed_quota_blocked_until');
  const prevTs = prev ? Date.parse(prev) : NaN;
  const minutes = Math.max(1, Number(cfg.quotaBackoffMin ?? 60) || 60);
  const until = new Date(now + minutes * 60_000).toISOString();
  upsertSetting(db, 'feed_quota_blocked_until', until);
  upsertSetting(db, 'feed_last_error_code', code);
  if (!(Number.isFinite(prevTs) && prevTs > now)) {
    console.log(`[feed] quota exhausted, pausing until ${until}`);
  }
}

/** ProviderError 中额度耗尽是最需要处理的信号（其余错误维持原有 feed_log 行为）。 */
function noteProviderError(db: Database, cfg: FeedConfig, e: unknown): void {
  if (e instanceof ProviderError && e.code === 'OUT_OF_USAGE_CREDITS') {
    markQuotaExhausted(db, cfg, e.code);
  }
}

/** One poll cycle for a single sport key. Never throws. */
async function pollOnceSingle(
  db: Database,
  cfg: FeedConfig,
  sportKey: string,
): Promise<{ ok: boolean; detail: unknown; sportKey: string }> {
  const client = createTheOddsClient();
  try {
    // 'upcoming' 萬能端點：一次請求回傳所有運動的 live + 近期場次（免費額度友好）。
    // 每筆 payload 自帶 sport_key → 由 upsertMatch 持久化到 matches.match_feed_key，
    // 供 scores 輪詢反查真實 sport key（/scores 不認 'upcoming'，直接打必 404 UNKNOWN_SPORT）。
    // 具体联赛用 FEED_WINDOW_DAYS 收敛 commenceTime 窗口；'upcoming' 不传日期参数。
    const windowDays = Math.max(1, Number(cfg.windowDays ?? 7) || 7);
    const opts = sportKey === 'upcoming'
      ? undefined
      : {
          fromIso: new Date().toISOString(),
          toIso: new Date(Date.now() + windowDays * 86_400_000).toISOString(),
        };
    const raw = await client.pendingMatches(sportKey, cfg.apiKey, opts);
    const res = ingestVendorUpdate(db, raw, cfg.provider, { overwriteManualOdds: false, sportKey });
    return { ok: !res.error, detail: res, sportKey };
  } catch (e) {
    db.prepare(
      `INSERT INTO feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
       VALUES (?, datetime('now'), 'error', 0, 0, ?)`,
    ).run(cfg.provider, (e as Error).message);
    noteProviderError(db, cfg, e);
    return { ok: false, detail: { error: (e as Error).message }, sportKey };
  }
}

/**
 * Resolve which sport keys to poll on the /scores endpoint (free-tier budget aware).
 * Priority:
 *   1. FEED_SCORE_KEYS (env / ~/.betting-feed.env) — explicit override, comma separated.
 *   2. DB 反查：matches.match_feed_key（由 odds ingest 持久化）按未結算場次數排序取前 limit 個。
 *   3. fallback：odds sportKeys 去掉 'upcoming'（/scores 對 'upcoming' 恆 404 UNKNOWN_SPORT）。
 */
export function resolveScoreKeys(
  db: Database,
  cfg: FeedConfig,
  limit = 3,
): string[] {
  const env = process.env.FEED_SCORE_KEYS ?? loadSecretsFile().FEED_SCORE_KEYS;
  const clean = (v: string | undefined) =>
    (v ?? '').split(',').map((k) => k.trim()).filter((k) => k && k !== 'upcoming');
  const fromEnv = clean(env);
  if (fromEnv.length > 0) return fromEnv.slice(0, limit);

  const rows = db.prepare(
    `SELECT match_feed_key AS k, COUNT(*) AS c FROM matches
     WHERE match_feed_key IS NOT NULL AND match_feed_key != 'upcoming'
       AND (
         (status = 'scheduled' AND datetime(kickoff_time) >= datetime('now', ?))
         OR status = 'finished'
       )
     GROUP BY match_feed_key ORDER BY c DESC LIMIT ?`,
  ).all(`-${Math.max(1, Math.trunc(Number(cfg.scoreLookbackDays ?? 3)) || 3)} days`, limit) as Array<{ k: string; c: number }>;
  if (rows.length > 0) return rows.map((r) => r.k);

  return cfg.sportKeys.filter((k) => k !== 'upcoming').slice(0, limit);
}

/** One poll cycle: fetch provider odds for all sport keys → ingest → fetch scores → auto-settle. Never throws. */
export async function pollOnce(
  db: Database,
  cfg: FeedConfig,
  opts: { pollScores?: boolean } = {},
): Promise<{ ok: boolean; detail: unknown; scores?: { ok: boolean; detail: unknown }; autoMarket?: { switched: number; matches: number } }> {
  const results: Array<{ ok: boolean; detail: unknown; sportKey: string }> = [];

  const isUpcoming = cfg.sportKeys.includes('upcoming');
  const keys = isUpcoming ? ['upcoming'] : cfg.sportKeys;

  // Poll odds for each sport key
  for (const sk of keys) {
    const r = await pollOnceSingle(db, cfg, sk);
    results.push(r);
    // Small delay between sport requests to be nice to the API
    if (keys.indexOf(sk) < keys.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  const allOddsOk = results.every((r) => r.ok);
  const oddsResult = { ok: allOddsOk, detail: results };

  if (!cfg.apiKey) {
    persistQuota(db);
    return { ok: allOddsOk, detail: oddsResult.detail };
  }

  // Poll scores for each sport key（額度治理：scores 端點比 odds 更新頻率低也夠用，
  // 由 startFeedScheduler 每 N 輪才傳 pollScores=true；admin 手動「立即拉取」仍每輪拉）
  const scoresResults: Array<{ ok: boolean; detail: unknown; sportKey: string }> = [];
  if (opts.pollScores !== false) {
    const client = createTheOddsClient();
    const scoreKeys = resolveScoreKeys(db, cfg);
    for (const sk of scoreKeys) {
      try {
        const rawScores = await client.scores(sk, cfg.apiKey, { daysFrom: cfg.scoresDaysFrom ?? 3 });
        const res = ingestScores(db, rawScores, cfg.provider);
        scoresResults.push({ ok: true, detail: res, sportKey: sk });
      } catch (e) {
        db.prepare(
          `INSERT INTO feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
           VALUES (?, datetime('now'), 'error', 0, 0, ?)`,
        ).run(cfg.provider, `[scores:${sk}] ${(e as Error).message}`);
        noteProviderError(db, cfg, e);
        scoresResults.push({ ok: false, detail: { error: (e as Error).message }, sportKey: sk });
      }
    }
  }

  // 滚球开盘/关盘自动切换（SPORTBOOK Step 36）：每轮 ingest 后，若开关开启则自动切换市场状态。
  const autoMarket = isAutoMarketEnabled(db) ? autoSwitchAll(db) : undefined;

  persistQuota(db);
  return { ok: oddsResult.ok, detail: oddsResult.detail, scores: { ok: scoresResults.every((r) => r.ok), detail: scoresResults }, autoMarket };
}

export interface PollTickResult {
  skipped: boolean;
  reason?: 'manual' | 'quota_backoff';
  tickCount: number;
  pollScores?: boolean;
  result?: Awaited<ReturnType<typeof pollOnce>>;
}

/**
 * 单轮调度（可被测试直接调用，无需 timers）：manual 跳过 → 额度冷却跳过 → 计数 → pollOnce。
 * 额度冷却期间只打日志、不写 feed_log，且不推进 tickCount（保持 scores 每 N 轮节奏）。
 */
export async function runPollTick(
  db: Database,
  cfg: FeedConfig,
  state: { tickCount: number; lastBlockedUntil: string | null },
  log = console,
): Promise<PollTickResult> {
  if (isManualMode(db)) {
    log.log('[feed] manual mode, skip');
    return { skipped: true, reason: 'manual', tickCount: state.tickCount };
  }

  const blockedUntil = readSetting(db, 'feed_quota_blocked_until');
  state.lastBlockedUntil = blockedUntil;
  if (blockedUntil) {
    const ts = Date.parse(blockedUntil);
    if (Number.isFinite(ts) && Date.now() < ts) {
      log.log(`[feed] quota backoff until ${blockedUntil}, skip`);
      return { skipped: true, reason: 'quota_backoff', tickCount: state.tickCount };
    }
  }

  state.tickCount += 1;
  // 額度治理：scores 每 SCORES_EVERY 輪才拉一次（比分變化頻率遠低於賠率，每輪拉純浪費 quota）。
  // 例：intervalMin=240 + SCORES_EVERY=2 → odds 6 次/日 + scores ≤3keys×3 次/日 ≤ 15 req/日 ≈ 450/月。
  const rawEvery = process.env.FEED_SCORES_EVERY ?? loadSecretsFile().FEED_SCORES_EVERY;
  const scoresEvery = Math.max(1, Number(rawEvery ?? '2') || 2);
  const pollScores = state.tickCount % scoresEvery === 1 || scoresEvery === 1; // 第一輪即拉，之後每 N 輪
  const r = await pollOnce(db, cfg, { pollScores });
  state.lastBlockedUntil = readSetting(db, 'feed_quota_blocked_until');
  log.log(`[feed] poll#${state.tickCount}${pollScores ? '+scores' : ''}: ${r.ok ? 'ok' : 'error'}`, r.detail);
  return { skipped: false, tickCount: state.tickCount, pollScores, result: r };
}

/** Start the periodic loop; returns a stop() handle. If disabled, logs and does not start. */
export function startFeedScheduler(db: Database, cfg: FeedConfig, log = console): () => void {
  if (!cfg.enabled) {
    log.log('[feed] disabled (FEED_ENABLED != 1, or missing FEED_API_KEY). Not scheduling.');
    return () => {};
  }
  if (!cfg.apiKey) {
    log.log('[feed] FEED_ENABLED=1 but FEED_API_KEY missing — not scheduling.');
    return () => {};
  }
  const ms = Math.max(1, cfg.intervalMin) * 60_000;
  log.log(`[feed] scheduled every ${cfg.intervalMin}m (sports=${cfg.sportKeys.join(',')})`);
  let stopped = false;
  const state = { tickCount: 0, lastBlockedUntil: null as string | null };
  const tick = async () => {
    if (stopped) return;
    await runPollTick(db, cfg, state, log);
  };
  void tick(); // immediate first poll
  const iv = setInterval(tick, ms);
  return () => { stopped = true; clearInterval(iv); log.log('[feed] stopped'); };
}
