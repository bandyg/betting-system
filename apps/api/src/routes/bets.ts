import { Router } from 'express';
import db from '../db/index.js';

export const betsRouter = Router();

type BetRow = {
  id: number;
  user_id: number;
  market_id: number;
  selection: string;
  price: number;
  stake: number;
  status: 'open' | 'won' | 'lost' | 'void';
  potential_payout: number;
  settled_at: string | null;
  created_at: string;
};

function getBetDetail(id: number) {
  const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(id) as BetRow | undefined;
  if (!bet) return null;
  const market = db
    .prepare(
      `SELECT m.id AS market_id, m.match_id, m.type, m.line, m.status AS market_status,
              mt.home_team, mt.away_team, mt.kickoff_time
       FROM markets m JOIN matches mt ON mt.id = m.match_id
       WHERE m.id = ?`,
    )
    .get(bet.market_id);
  return { ...bet, market };
}

// POST /bets — place a bet: validate user/market/selection, check balance, deduct stake, create bet
// body: { userId, marketId, selection, stake }
betsRouter.post('/bets', (req, res) => {
  const { userId, marketId, selection, stake } = req.body ?? {};

  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    return res.status(400).json({ error: 'userId is required (positive integer)' });
  }
  const mid = Number(marketId);
  if (!Number.isInteger(mid) || mid <= 0) {
    return res.status(400).json({ error: 'marketId is required (positive integer)' });
  }
  if (typeof selection !== 'string' || selection.trim() === '') {
    return res.status(400).json({ error: 'selection is required (non-empty string)' });
  }
  const stakeNum = Number(stake);
  if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
    return res.status(400).json({ error: 'stake must be a positive number' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }

  const market = db
    .prepare('SELECT id, match_id, type, line, status FROM markets WHERE id = ?')
    .get(mid) as
    | { id: number; match_id: number; type: string; line: number | null; status: string }
    | undefined;
  if (!market) {
    return res.status(404).json({ error: 'market not found' });
  }
  if (market.status !== 'open') {
    return res.status(409).json({ error: `market is ${market.status}, cannot place bet` });
  }

  const sel = selection.trim();
  const oddsRow = db
    .prepare('SELECT price FROM odds WHERE market_id = ? AND selection = ?')
    .get(mid, sel) as { price: number } | undefined;
  if (!oddsRow) {
    return res.status(400).json({ error: `selection "${sel}" not available on this market` });
  }

  const acc = db
    .prepare('SELECT id, balance FROM accounts WHERE user_id = ?')
    .get(uid) as { id: number; balance: number };
  if (acc.balance < stakeNum) {
    return res
      .status(400)
      .json({ error: `insufficient balance: have ${acc.balance}, need ${stakeNum}` });
  }

  const place = db.transaction(() => {
    const newBalance = acc.balance - stakeNum;
    db.prepare("UPDATE accounts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
      newBalance,
      acc.id,
    );
    const info = db
      .prepare(
        `INSERT INTO bets (user_id, market_id, selection, price, stake, potential_payout)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(uid, mid, sel, oddsRow.price, stakeNum, stakeNum * oddsRow.price);
    const betId = Number(info.lastInsertRowid);
    db.prepare(
      'INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
    ).run(acc.id, 'bet_stake', -stakeNum, 'bet', betId);
    return { betId, newBalance };
  });
  const result = place();

  const bet = getBetDetail(result.betId);
  res.status(201).json({
    bet,
    account: { id: acc.id, balance: result.newBalance },
  });
});

// GET /bets?userId= — list bets (optionally filtered by user)
betsRouter.get('/bets', (req, res) => {
  const q = req.query.userId;
  if (q !== undefined) {
    const uid = Number(q);
    if (!Number.isInteger(uid) || uid <= 0) {
      return res.status(400).json({ error: 'userId must be a positive integer' });
    }
  }
  const rows = (q === undefined
    ? db.prepare('SELECT * FROM bets ORDER BY id DESC').all()
    : db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC').all(Number(q))) as BetRow[];
  const list = rows.map((b) => getBetDetail(b.id));
  res.json({ count: list.length, bets: list });
});

// GET /bets/:id — single bet detail
betsRouter.get('/bets/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid bet id' });
  }
  const bet = getBetDetail(id);
  if (!bet) {
    return res.status(404).json({ error: 'bet not found' });
  }
  res.json({ bet });
});
