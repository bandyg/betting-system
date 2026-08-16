import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';

export const marketsRouter = Router();

const MARKET_TYPES = ['1x2', 'ah', 'ou'] as const;
type MarketType = (typeof MARKET_TYPES)[number];

type MarketRow = {
  id: number;
  match_id: number;
  type: '1x2' | 'ah' | 'ou';
  line: number | null;
  status: 'open' | 'suspended' | 'settled';
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
// POST /matches/:id/markets — create market + odds（仅 admin）
marketsRouter.post('/matches/:id/markets', requireAuth, requireRole('admin'), (req, res) => {
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

// ============ 交易工具（Step 24，仅 admin）============

// PUT /markets/:id/odds — 调赔：更新部分或全部 selection 的赔率（admin）
// body: { odds: { <selection>: price, ... } }
marketsRouter.put('/markets/:id/odds', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid market id' });
  }
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as MarketRow | undefined;
  if (!market) {
    return res.status(404).json({ error: 'market not found' });
  }
  if (market.status === 'settled') {
    return res.status(409).json({ error: 'cannot update odds on a settled market' });
  }

  const { odds } = req.body ?? {};
  if (typeof odds !== 'object' || odds === null || Array.isArray(odds)) {
    return res.status(400).json({ error: 'odds must be an object like { home: 2.5, draw: 3.1 }' });
  }
  const entries = Object.entries(odds as Record<string, unknown>);
  if (entries.length === 0) {
    return res.status(400).json({ error: 'odds must contain at least one selection' });
  }
  const allowed = SELECTIONS[market.type as MarketType];
  const updates: Array<{ selection: string; price: number }> = [];
  for (const [selection, price] of entries) {
    if (!allowed.includes(selection)) {
      return res
        .status(400)
        .json({ error: `selection "${selection}" not valid for ${market.type}; allowed: ${allowed.join(', ')}` });
    }
    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice <= 1) {
      return res.status(400).json({ error: `price for "${selection}" must be a number > 1` });
    }
    updates.push({ selection, price: numPrice });
  }

  // 校验每个 selection 在该市场真实存在，再批量更新
  const existing = db
    .prepare('SELECT selection FROM odds WHERE market_id = ?')
    .all(id) as { selection: string }[];
  const existingSet = new Set(existing.map((e) => e.selection));
  for (const u of updates) {
    if (!existingSet.has(u.selection)) {
      return res.status(400).json({ error: `selection "${u.selection}" not available on this market` });
    }
  }

  const stmt = db.prepare('UPDATE odds SET price = ? WHERE market_id = ? AND selection = ?');
  db.transaction(() => {
    for (const u of updates) {
      stmt.run(u.price, id, u.selection);
    }
  })();

  const oddsRows = db
    .prepare('SELECT selection, price FROM odds WHERE market_id = ? ORDER BY id')
    .all(id);
  res.json({ market: { ...market, odds: oddsRows } });
});

// POST /markets/:id/suspend — 挂盘（open → suspended，仅 admin）
marketsRouter.post('/markets/:id/suspend', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid market id' });
  }
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as MarketRow | undefined;
  if (!market) {
    return res.status(404).json({ error: 'market not found' });
  }
  if (market.status !== 'open') {
    return res.status(409).json({ error: `market is ${market.status}, can only suspend an open market` });
  }
  db.prepare("UPDATE markets SET status = 'suspended' WHERE id = ?").run(id);
  const updated = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as MarketRow;
  res.json({ market: updated });
});

// POST /markets/:id/resume — 开盘（suspended → open，仅 admin）
marketsRouter.post('/markets/:id/resume', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid market id' });
  }
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as MarketRow | undefined;
  if (!market) {
    return res.status(404).json({ error: 'market not found' });
  }
  if (market.status !== 'suspended') {
    return res.status(409).json({ error: `market is ${market.status}, can only resume a suspended market` });
  }
  db.prepare("UPDATE markets SET status = 'open' WHERE id = ?").run(id);
  const updated = db.prepare('SELECT * FROM markets WHERE id = ?').get(id) as MarketRow;
  res.json({ market: updated });
});
