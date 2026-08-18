// scheduler.ts (P2) — recurring feed loop. Disabled by default until a provider API key is configured.
// env:
//   FEED_ENABLED=1           turn on
//   FEED_PROVIDER=soccer_epl (the-odds-api sport key; default soccer_epl)
//   FEED_API_KEY=...         provider key (the-odds-api / RapidAPI key)
//   FEED_INTERVAL_MIN=10     poll minutes (free-tier friendly, default 10)
import type { Database } from 'better-sqlite3';
import { createTheOddsClient } from './provider.js';
import { ingestVendorUpdate } from './ingest.js';

export interface FeedConfig {
  enabled: boolean;
  provider: string;      // vendor tag stored on rows
  apiKey: string;
  intervalMin: number;
  sportKey: string;
}

export function readFeedConfig(env: NodeJS.ProcessEnv = process.env): FeedConfig {
  return {
    enabled: env.FEED_ENABLED === '1',
    provider: env.FEED_PROVIDER ?? 'the-odds-api',
    apiKey: env.FEED_API_KEY ?? '',
    intervalMin: Number(env.FEED_INTERVAL_MIN ?? '10'),
    sportKey: env.FEED_SPORT_KEY ?? 'soccer_epl',
  };
}

/** One poll cycle: fetch provider → ingest → return result. Never throws (records feed_log error). */
export async function pollOnce(db: Database, cfg: FeedConfig): Promise<{ ok: boolean; detail: unknown }> {
  const client = createTheOddsClient();
  try {
    const raw = await client.pendingMatches(cfg.sportKey, cfg.apiKey);
    const res = ingestVendorUpdate(db, raw, cfg.provider, { overwriteManualOdds: false });
    return { ok: !res.error, detail: res };
  } catch (e) {
    db.prepare(
      `INSERT INTO feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
       VALUES (?, datetime('now'), 'error', 0, 0, ?)`,
    ).run(cfg.provider, (e as Error).message);
    return { ok: false, detail: { error: (e as Error).message } };
  }
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
  log.log(`[feed] scheduled every ${cfg.intervalMin}m (sport=${cfg.sportKey})`);
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const r = await pollOnce(db, cfg);
    log.log(`[feed] poll: ${r.ok ? 'ok' : 'error'}`, r.detail);
  };
  void tick(); // immediate first poll
  const iv = setInterval(tick, ms);
  return () => { stopped = true; clearInterval(iv); log.log('[feed] stopped'); };
}
