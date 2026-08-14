import { Router } from 'express';
import db from '../db/index.js';

export const marketsRouter = Router();

const MARKET_TYPES = ['1x2', 'ah', 'ou'] as const;
type MarketType = (typeof MARKET_TYPES)[number];

type MarketRow = {
  id: number;
  match_id: number;
  type: '1x2' | 'ah' | 'ou';
  line: number | null;
  status: 'open' | 'settled';
  created_at: string;
};

// Selections allowed per market type
const SELECTIONS: Record<MarketType, string[]> = {
  '1x2': ['home', 'draw', 'away'],
  ah: ['home', 'away'],
  ou: ['over', 'under'],
};

// POST /matches/:id/markets — create market + odds in one call
// body: { type: '1x2'|'ah'|'ou', line?: number, odds: { <selection>: price } }
marketsRouter.post('/matches/:id/markets', (req, res) => {
  const matchId = Number(req.params.id);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).json({ error: 'invalid match id' });
  }
  const match = db.prepare('SELECT id, status FROM matches WHERE id = ?').get(matchId) as
    | { id: number; status: string }
    | undefined;
  if (!match) {
    return res.status(404).json({ error: 'match not found' });
  }
  if (match.status !== 'scheduled') {
    return res.status(409).json({ error: `cannot add market to a ${match.status} match` });
  }

  const { type, line, odds } = req.body ?? {};
  if (typeof type !== 'string' || !MARKET_TYPES.includes(type as MarketType)) {
    return res.status(400).json({ error: `type must be one of: ${MARKET_TYPES.join(', ')}` });
  }
  const mType = type as MarketType;

  if (mType === '1x2') {
    if (line !== undefined && line !== null) {
      return res.status(400).json({ error: 'line must not be set for 1x2 market' });
    }
  } else {
    const numLine = Number(line);
    if (!Number.isFinite(numLine) || numLine === 0) {
      return res.status(400).json({ error: `line is required and must be non-zero for ${mType} market` });
    }
  }

  if (typeof odds !== 'object' || odds === null || Array.isArray(odds)) {
    return res.status(400).json({ error: 'odds must be an object like { home: 2.1, draw: 3.2 }' });
  }
  const entries = Object.entries(odds as Record<string, unknown>);
  if (entries.length === 0) {
    return res.status(400).json({ error: 'odds must contain at least one selection' });
  }
  const allowed = SELECTIONS[mType];
  for (const [selection, price] of entries) {
    if (!allowed.includes(selection)) {
      return res
        .status(400)
        .json({ error: `selection "${selection}" not valid for ${mType}; allowed: ${allowed.join(', ')}` });
    }
    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice <= 1) {
      return res.status(400).json({ error: `price for "${selection}" must be a number > 1` });
    }
  }

  // No duplicate market of same type+line on the same match
  const lineVal = mType === '1x2' ? null : Number(line);
  const dup = db
    .prepare('SELECT id FROM markets WHERE match_id = ? AND type = ? AND line IS ?')
    .get(matchId, mType, lineVal);
  if (dup) {
    return res.status(409).json({ error: `market ${mType} (line ${lineVal ?? '-'}) already exists for this match` });
  }

  const create = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO markets (match_id, type, line) VALUES (?, ?, ?)')
      .run(matchId, mType, lineVal);
    const marketId = Number(info.lastInsertRowid);
    const insertOdds = db.prepare('INSERT INTO odds (market_id, selection, price) VALUES (?, ?, ?)');
    for (const [selection, price] of entries) {
      insertOdds.run(marketId, selection, Number(price));
    }
    return marketId;
  });
  const marketId = create();

  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId) as MarketRow;
  const oddsRows = db
    .prepare('SELECT selection, price FROM odds WHERE market_id = ? ORDER BY id')
    .all(marketId);
  res.status(201).json({ market: { ...market, odds: oddsRows } });
});

// GET /markets/:id — market with odds
marketsRouter.get('/markets/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid market id' });
  }
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as
    | (MarketRow & { match_id: number; status: 'open' | 'settled'; created_at: string })
    | undefined;
  if (!market) {
    return res.status(404).json({ error: 'market not found' });
  }
  const odds = db
    .prepare('SELECT selection, price FROM odds WHERE market_id = ? ORDER BY id')
    .all(id);
  res.json({ market: { ...market, odds } });
});
