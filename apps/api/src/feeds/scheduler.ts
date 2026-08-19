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
import { createTheOddsClient } from './provider.js';
import { ingestVendorUpdate, ingestScores } from './ingest.js';

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
  };
}

/** 手动模式：settings.feed_manual='true' 时调度器每轮跳过拉取（admin 面板开关，无需重启进程） */
export function isManualMode(db: Database): boolean {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'feed_manual'").get() as { value: string } | undefined;
  return row?.value === 'true';
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
    const raw = await client.pendingMatches(sportKey, cfg.apiKey);
    const res = ingestVendorUpdate(db, raw, cfg.provider, { overwriteManualOdds: false, sportKey });
    return { ok: !res.error, detail: res, sportKey };
  } catch (e) {
    db.prepare(
      `INSERT INTO feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
       VALUES (?, datetime('now'), 'error', 0, 0, ?)`,
    ).run(cfg.provider, (e as Error).message);
    return { ok: false, detail: { error: (e as Error).message }, sportKey };
  }
}

/** One poll cycle: fetch provider odds for all sport keys → ingest → fetch scores → auto-settle. Never throws. */
export async function pollOnce(
  db: Database,
  cfg: FeedConfig,
): Promise<{ ok: boolean; detail: unknown; scores?: { ok: boolean; detail: unknown } }> {
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

  if (!cfg.apiKey) return { ok: allOddsOk, detail: oddsResult.detail };

  // Poll scores for each sport key
  const scoresResults: Array<{ ok: boolean; detail: unknown; sportKey: string }> = [];
  const client = createTheOddsClient();
  for (const sk of keys) {
    try {
      const rawScores = await client.scores(sk, cfg.apiKey);
      const res = ingestScores(db, rawScores, cfg.provider);
      scoresResults.push({ ok: true, detail: res, sportKey: sk });
    } catch (e) {
      db.prepare(
        `INSERT INTO feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
         VALUES (?, datetime('now'), 'error', 0, 0, ?)`,
      ).run(cfg.provider, (e as Error).message);
      scoresResults.push({ ok: false, detail: { error: (e as Error).message }, sportKey: sk });
    }
  }

  return { ok: oddsResult.ok, detail: oddsResult.detail, scores: { ok: scoresResults.every((r) => r.ok), detail: scoresResults } };
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
  const tick = async () => {
    if (stopped) return;
    if (isManualMode(db)) {
      log.log('[feed] manual mode, skip');
      return;
    }
    const r = await pollOnce(db, cfg);
    log.log(`[feed] poll: ${r.ok ? 'ok' : 'error'}`, r.detail);
  };
  void tick(); // immediate first poll
  const iv = setInterval(tick, ms);
  return () => { stopped = true; clearInterval(iv); log.log('[feed] stopped'); };
}
