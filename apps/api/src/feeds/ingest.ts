// ingest.ts (P2) — upsert core: feed rows → SQLite (matches/markets/odds) with source isolation.
import type { Database } from 'better-sqlite3';
import type { IngestMatch, MarketRow, MatchRowSets, OddsRow } from './types.js';
import { normalizeVendorMatch, toRows } from './mapper.js';

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
