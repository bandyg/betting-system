// ingest.ts (P2) — upsert core: feed rows → SQLite (matches/markets/odds) with source isolation.
import type { Database } from 'better-sqlite3';
import type { IngestMatch, MarketRow, MatchRowSets, OddsRow } from './types.js';
import { normalizeVendorMatch, toRows } from './mapper.js';
import type { TheOddsScore } from './provider.js';
import { settleMatch } from './settle.js';

export interface IngestResult {
  seen: number;
  inserted: number;   // matches newly created
  updated: number;    // matches touched (re-ingest refresh)
}

function upsertOdds(db: Database, marketId: number, odds: OddsRow[]): void {
  const stmt = db.prepare(
    `INSERT INTO odds (market_id, selection, price) VALUES (?, ?, ?)
     ON CONFLICT(market_id, selection) DO UPDATE SET price = excluded.price`,
  );
  for (const o of odds) stmt.run(marketId, o.selection, o.price);
}

/**
 * Upsert ONE match + its markets/odds, source-isolated:
 *  - match keyed by external_id (uniquely owned by the feed source)
 *  - market updates (line/status/odds) are ONLY applied when the market is feed-owned
 *    (source != 'manual'), unless `overwriteManualOdds` is set.
 * @returns true if the match was newly inserted.
 */
export function upsertMatch(db: Database, rows: MatchRowSets, opts: { overwriteManualOdds?: boolean } = {}): boolean {
  const { match, markets } = rows;
  return db.transaction(() => {
    const existing = db.prepare('SELECT id FROM matches WHERE external_id = ?').get(match.external_id) as { id: number } | undefined;
    let matchId: number;
    let isNew = false;
    if (existing) {
      matchId = existing.id;
      db.prepare(
        `UPDATE matches SET home_team=?, away_team=?, kickoff_time=?, status=?,
           home_score=COALESCE(?,home_score), away_score=COALESCE(?,away_score),
           sport=?, league=?, source=?
         WHERE id=?`,
      ).run(match.home_team, match.away_team, match.kickoff_time, match.status,
        match.home_score, match.away_score, match.sport, match.league, match.source, matchId);
    } else {
      isNew = true;
      const info = db.prepare(
        `INSERT INTO matches (home_team, away_team, kickoff_time, status, home_score, away_score, external_id, sport, league, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(match.home_team, match.away_team, match.kickoff_time, match.status,
        match.home_score, match.away_score, match.external_id, match.sport, match.league, match.source);
      matchId = Number(info.lastInsertRowid);
    }

    for (const mk of markets) {
      const mEx = db.prepare('SELECT id, source FROM markets WHERE external_id = ?').get(mk.external_id) as { id: number; source: string } | undefined;
      if (mEx) {
        const feedOwned = mEx.source !== 'manual';
        if (feedOwned || opts.overwriteManualOdds) {
          db.prepare('UPDATE markets SET match_id=?, type=?, line=?, status=? WHERE id=?').run(matchId, mk.type, mk.line, mk.status, mEx.id);
          upsertOdds(db, mEx.id, mk.odds);
        }
      } else {
        const info = db.prepare(
          'INSERT INTO markets (match_id, type, line, status, external_id, source) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(matchId, mk.type, mk.line, mk.status, mk.external_id, mk.source);
        upsertOdds(db, Number(info.lastInsertRowid), mk.odds);
      }
    }
    return isNew;
  })();
}

/** Normalize raw vendor payloads then upsert; records a feed_log row. */
export function ingestVendorUpdate(
  db: Database,
  rawMatches: unknown[],
  vendor: string,
  opts: { overwriteManualOdds?: boolean } = {},
): IngestResult & { error?: string } {
  try {
    const res = db.transaction(() => {
      const seen = rawMatches.length;
      let inserted = 0;
      let updated = 0;
      for (const raw of rawMatches) {
        const ing = normalizeVendorMatch(raw, vendor);
        const isNew = upsertMatch(db, toRows(ing, vendor), opts);
        if (isNew) inserted++; else updated++;
      }
      return { seen, inserted, updated };
    })();
    db.prepare(
      `INSERT INTO feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
       VALUES (?, datetime('now'), 'ok', ?, ?, NULL)`,
    ).run(vendor, res.seen, res.inserted + res.updated);
    return res;
  } catch (e) {
    const msg = (e as Error).message;
    db.prepare(
      `INSERT INTO feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
       VALUES (?, datetime('now'), 'error', 0, 0, ?)`,
    ).run(vendor, msg);
    return { seen: 0, inserted: 0, updated: 0, error: msg };
  }
}

export type { IngestMatch, MarketRow }; // re-export convenience

/* ------------------------------------------------------------------ *
 * scores ingestion (P4) — final scores → finished + optional auto-settle
 * ------------------------------------------------------------------ */

export interface IngestScoresResult {
  seen: number;      // completed matches that carried a score line
  updated: number;   // matches written final score + status finished
  settled: number;   // matches auto-settled (subset of updated)
  skipped: number;   // no external match / already settled / unparseable score
  errors: number;    // per-match auto-settle exceptions
}

/** settings.feed_auto_settle === 'true' → auto-settle finished feed matches. */
export function isAutoSettleEnabled(db: Database): boolean {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'feed_auto_settle'").get() as { value: string } | undefined;
  return row?.value === 'true';
}

/** Map a vendor score line to (home, away) final goals by matching team names. */
function finalScore(
  s: TheOddsScore,
  homeTeam: string,
  awayTeam: string,
): { home: number; away: number } | null {
  if (!Array.isArray(s.scores) || s.scores.length === 0) return null;
  const home = homeTeam.trim().toLowerCase();
  const away = awayTeam.trim().toLowerCase();
  let hs: number | null = null;
  let as: number | null = null;
  for (const x of s.scores) {
    const n = x.name.trim().toLowerCase();
    if (n === home) hs = Number(x.score);
    if (n === away) as = Number(x.score);
  }
  if (hs == null || as == null || !Number.isFinite(hs) || !Number.isFinite(as)) return null;
  return { home: hs, away: as };
}

/**
 * Apply final scores from the vendor `/scores/` endpoint.
 * Only completed matches with a score line are touched; matches are located by external_id
 * (feed-owned only — manual rows are never modified). Matches already settled are skipped.
 * When settings.feed_auto_settle === 'true' each updated match is settled via settleMatch
 * (idempotent, per-match try/catch so one failure never aborts the batch).
 */
export function ingestScores(
  db: Database,
  scores: TheOddsScore[],
  vendor: string,
): IngestScoresResult {
  const res: IngestScoresResult = { seen: 0, updated: 0, settled: 0, skipped: 0, errors: 0 };
  const autoSettle = isAutoSettleEnabled(db);
  try {
    for (const s of scores) {
      if (!s.completed || !Array.isArray(s.scores) || s.scores.length === 0) continue;
      res.seen += 1;

      const match = db
        .prepare("SELECT id, status, home_team, away_team FROM matches WHERE external_id = ? AND source <> 'manual'")
        .get(s.id) as { id: number; status: string; home_team: string; away_team: string } | undefined;
      if (!match) { res.skipped += 1; continue; }
      if (match.status === 'settled') { res.skipped += 1; continue; }

      const score = finalScore(s, match.home_team, match.away_team);
      if (!score) { res.skipped += 1; continue; }

      db.prepare(
        "UPDATE matches SET home_score = ?, away_score = ?, status = 'finished' WHERE id = ?",
      ).run(score.home, score.away, match.id);
      res.updated += 1;

      if (autoSettle) {
        try {
          const r = settleMatch(db, match.id);
          if (r.status === 'settled') res.settled += 1;
          else res.skipped += 1;
        } catch {
          res.errors += 1;
        }
      }
    }
    db.prepare(
      `INSERT INTO feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
       VALUES (?, datetime('now'), 'ok', ?, ?, NULL)`,
    ).run(vendor, res.seen, res.updated);
  } catch (e) {
    const msg = (e as Error).message;
    db.prepare(
      `INSERT INTO feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
       VALUES (?, datetime('now'), 'error', 0, 0, ?)`,
    ).run(vendor, msg);
    res.errors += 1;
  }
  return res;
}
