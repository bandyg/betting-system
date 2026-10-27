import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';

export const matchesRouter = Router();

type MarketRow = {
  id: number;
  match_id: number;
  type: '1x2' | 'ah' | 'ou';
  line: number | null;
  status: 'open' | 'settled' | 'suspended';
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

// POST /matches — create match (admin only)
matchesRouter.post('/matches', requireAuth, requireRole('admin'), (req, res) => {
  const { homeTeam, awayTeam, kickoffTime, sport, league } = req.body ?? {};
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
    .prepare('INSERT INTO matches (home_team, away_team, kickoff_time, sport, league) VALUES (?, ?, ?, ?, ?)')
    .run(
      homeTeam.trim(),
      awayTeam.trim(),
      new Date(kickoffTime).toISOString(),
      typeof sport === 'string' && sport.trim() ? sport.trim() : null,
      typeof league === 'string' && league.trim() ? league.trim() : null,
    );
  const match = getMatchDetail(Number(info.lastInsertRowid));
  res.status(201).json({ match });
});

// GET /matches — list matches with optional filtering, search, date range, odds and pagination
matchesRouter.get('/matches', (req, res) => {
  const { sport, league, status, q, from, to, withOdds, limit: limitRaw, offset: offsetRaw, sort: sortRaw } = req.query;

  let where = '';
  const params: unknown[] = [];

  if (typeof sport === 'string' && sport.trim()) {
    where += ' AND sport = ?';
    params.push(sport.trim());
  }
  if (typeof league === 'string' && league.trim()) {
    where += ' AND league = ?';
    params.push(league.trim());
  }
  if (typeof status === 'string' && status.trim()) {
    where += ' AND status = ?';
    params.push(status.trim());
  }
  if (typeof q === 'string' && q.trim()) {
    const pattern = `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;
    where += " AND (home_team LIKE ? ESCAPE '\\' OR away_team LIKE ? ESCAPE '\\' OR league LIKE ? ESCAPE '\\')";
    params.push(pattern, pattern, pattern);
  }
  if (from !== undefined) {
    if (typeof from !== 'string' || Number.isNaN(Date.parse(from))) {
      return res.status(400).json({ error: 'from must be a valid ISO datetime string' });
    }
    where += ' AND datetime(kickoff_time) >= datetime(?)';
    params.push(from);
  }
  if (to !== undefined) {
    if (typeof to !== 'string' || Number.isNaN(Date.parse(to))) {
      return res.status(400).json({ error: 'to must be a valid ISO datetime string' });
    }
    where += ' AND datetime(kickoff_time) <= datetime(?)';
    params.push(to);
  }
  if (withOdds === '1' || withOdds === 'true') {
    where +=
      " AND EXISTS (SELECT 1 FROM markets mk JOIN odds o ON o.market_id = mk.id WHERE mk.match_id = matches.id AND mk.status = 'open')";
  }

  let limit: number | null = null;
  if (limitRaw !== undefined) {
    const raw = typeof limitRaw === 'string' ? limitRaw.trim() : '';
    const parsed = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
      return res.status(400).json({ error: 'limit must be an integer between 1 and 500' });
    }
    limit = parsed;
  }

  let offset = 0;
  if (offsetRaw !== undefined) {
    const raw = typeof offsetRaw === 'string' ? offsetRaw.trim() : '';
    const parsed = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(parsed) || parsed < 0) {
      return res.status(400).json({ error: 'offset must be an integer >= 0' });
    }
    offset = parsed;
  }

  let sort: 'kickoff_asc' | 'kickoff_desc' = 'kickoff_asc';
  if (sortRaw !== undefined) {
    if (sortRaw !== 'kickoff_asc' && sortRaw !== 'kickoff_desc') {
      return res.status(400).json({ error: 'sort must be kickoff_asc or kickoff_desc' });
    }
    sort = sortRaw;
  }

  const total = (db.prepare(`SELECT COUNT(*) AS total FROM matches WHERE 1=1${where}`).get(...params) as { total: number })
    .total;

  let sql = `SELECT * FROM matches WHERE 1=1${where}`;
  sql += sort === 'kickoff_desc' ? ' ORDER BY kickoff_time DESC, id DESC' : ' ORDER BY kickoff_time, id';
  const pageParams: unknown[] = [...params];
  if (limit !== null) {
    sql += ' LIMIT ? OFFSET ?';
    pageParams.push(limit, offset);
  }

  const rows = db.prepare(sql).all(...pageParams) as Array<{ id: number }>;
  const list = rows.map((m) => getMatchDetail(m.id));
  res.json({
    count: list.length,
    total,
    limit,
    offset,
    hasMore: offset + list.length < total,
    matches: list,
  });
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
