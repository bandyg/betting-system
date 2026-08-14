import { Router } from 'express';
import db from '../db/index.js';

export const matchesRouter = Router();

type MarketRow = {
  id: number;
  match_id: number;
  type: '1x2' | 'ah' | 'ou';
  line: number | null;
  status: 'open' | 'settled';
  created_at: string;
};

type OddsRow = { selection: string; price: number };

function loadMarkets(matchId: number): Array<MarketRow & { odds: OddsRow[] }> {
  const markets = db
    .prepare('SELECT * FROM markets WHERE match_id = ? ORDER BY id')
    .all(matchId) as MarketRow[];
  const oddsStmt = db.prepare('SELECT selection, price FROM odds WHERE market_id = ? ORDER BY id');
  return markets.map((m) => ({ ...m, odds: oddsStmt.all(m.id) as OddsRow[] }));
}

function getMatchDetail(id: number) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
  if (!match) return null;
  return { ...match, markets: loadMarkets(id) };
}

// POST /matches — create a football match
matchesRouter.post('/matches', (req, res) => {
  const { homeTeam, awayTeam, kickoffTime } = req.body ?? {};
  if (typeof homeTeam !== 'string' || homeTeam.trim() === '') {
    return res.status(400).json({ error: 'homeTeam is required (non-empty string)' });
  }
  if (typeof awayTeam !== 'string' || awayTeam.trim() === '') {
    return res.status(400).json({ error: 'awayTeam is required (non-empty string)' });
  }
  if (typeof kickoffTime !== 'string' || Number.isNaN(Date.parse(kickoffTime))) {
    return res.status(400).json({ error: 'kickoffTime must be a valid ISO datetime string' });
  }
  const info = db
    .prepare('INSERT INTO matches (home_team, away_team, kickoff_time) VALUES (?, ?, ?)')
    .run(homeTeam.trim(), awayTeam.trim(), new Date(kickoffTime).toISOString());
  const match = getMatchDetail(Number(info.lastInsertRowid));
  res.status(201).json({ match });
});

// GET /matches — list all matches with markets + odds
matchesRouter.get('/matches', (_req, res) => {
  const matches = db.prepare('SELECT * FROM matches ORDER BY kickoff_time, id').all() as Array<{
    id: number;
  }>;
  const list = matches.map((m) => getMatchDetail(m.id));
  res.json({ count: list.length, matches: list });
});

// GET /matches/:id — single match with markets + odds
matchesRouter.get('/matches/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid match id' });
  }
  const match = getMatchDetail(id);
  if (!match) {
    return res.status(404).json({ error: 'match not found' });
  }
  res.json({ match });
});
