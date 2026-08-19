import { Router } from 'express';
import db from '../db/index.js';

export const sportsRouter = Router();

type SportGroup = {
  sport: string;
  leagues: Array<{ league: string; count: number }>;
};

// GET /sports — list all sports with league counts
sportsRouter.get('/sports', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT sport, league, COUNT(*) as count
       FROM matches
       WHERE sport IS NOT NULL
       GROUP BY sport, league
       ORDER BY sport, count DESC`,
    )
    .all() as Array<{ sport: string; league: string; count: number }>;

  // Group by sport
  const map = new Map<string, { sport: string; leagues: Array<{ league: string; count: number }> }>();
  for (const row of rows) {
    if (!map.has(row.sport)) {
      map.set(row.sport, { sport: row.sport, leagues: [] });
    }
    map.get(row.sport)!.leagues.push({ league: row.league, count: row.count });
  }

  // Also include manual matches (sport=null) as "other"
  const manualCount = db
    .prepare('SELECT COUNT(*) as n FROM matches WHERE sport IS NULL')
    .get() as { n: number };
  if (manualCount.n > 0) {
    map.set('other', { sport: 'other', leagues: [{ league: 'Manual', count: manualCount.n }] });
  }

  res.json({ sports: Array.from(map.values()) });
});

// GET /leagues?sport=soccer — list leagues for a sport
sportsRouter.get('/leagues', (req, res) => {
  const sport = req.query.sport as string | undefined;
  let rows: Array<{ league: string; count: number }>;

  if (sport) {
    rows = db
      .prepare(
        `SELECT league, COUNT(*) as count
         FROM matches
         WHERE sport = ?
         GROUP BY league
         ORDER BY count DESC`,
      )
      .all(sport) as Array<{ league: string; count: number }>;
  } else {
    rows = db
      .prepare(
        `SELECT sport || ':' || league as league, COUNT(*) as count
         FROM matches
         WHERE sport IS NOT NULL
         GROUP BY sport, league
         ORDER BY count DESC`,
      )
      .all() as Array<{ league: string; count: number }>;
  }

  res.json({ sport: sport ?? null, leagues: rows });
});
