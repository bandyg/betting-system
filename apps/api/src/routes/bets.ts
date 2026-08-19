import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth } from './middleware.js';
import { checkRisk } from '../risk.js';

export const betsRouter = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

type BetRow = {
  id: number;
  user_id: number;
  market_id: number | null;
  selection: string | null;
  bet_type: 'single' | 'parlay';
  price: number;
  stake: number;
  status: 'open' | 'won' | 'lost' | 'void';
  potential_payout: number;
  settled_at: string | null;
  created_at: string;
};

type LegRow = {
  id: number;
  market_id: number;
  selection: string;
  price: number;
  status: string;
  settled_at: string | null;
  match_id: number;
  home_team: string;
  away_team: string;
  kickoff_time: string;
};

function getBetDetail(id: number) {
  const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(id) as BetRow | undefined;
  if (!bet) return null;
  if (bet.bet_type === 'parlay') {
    const legs = db
      .prepare(
        `SELECT bl.id, bl.market_id, bl.selection, bl.price, bl.status, bl.settled_at,
                m.match_id, mt.home_team, mt.away_team, mt.kickoff_time
         FROM bet_legs bl
         JOIN markets m ON m.id = bl.market_id
         JOIN matches mt ON mt.id = m.match_id
         WHERE bl.bet_id = ?
         ORDER BY bl.id`,
      )
      .all(id) as LegRow[];
    return { ...bet, market: null, legs };
  }
  const market = db
    .prepare(
      `SELECT m.id AS market_id, m.match_id, m.type, m.line, m.status AS market_status,
              mt.home_team, mt.away_team, mt.kickoff_time
       FROM markets m JOIN matches mt ON mt.id = m.match_id
       WHERE m.id = ?`,
    )
    .get(bet.market_id as number);
  return { ...bet, market };
}

// POST /bets — place a bet: validate user/market/selection, check balance, deduct stake, create bet
// body: { marketId, selection, stake }（userId 从登录 token 取，不信任客户端传值）
betsRouter.post('/bets', requireAuth, (req, res) => {
  const uid = (res.locals.user as { id: number }).id;
  const { marketId, selection, stake } = req.body ?? {};

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

  // 风控校验：单笔上/下限 + 赔率范围 + 日累计（扣款前拦截）
  const riskErr = checkRisk({ stake: stakeNum, price: oddsRow.price, userId: uid });
  if (riskErr) {
    return res.status(400).json({ error: riskErr });
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

// POST /bets/parlay — place an accumulator bet: ≥2 legs across different matches, stake is the whole ticket.
// body: { legs: [{ marketId, selection }, ...], stake }（userId 从 token 取）
//   Combined odds = product of all leg odds. All legs must be on 'open' markets and on distinct matches.
//   Deducts stake once; each leg lands in bet_legs. Settled together by settleMatch once every leg's market is settled.
betsRouter.post('/bets/parlay', requireAuth, (req, res) => {
  const uid = (res.locals.user as { id: number }).id;
  const { legs, stake } = req.body ?? {};

  if (!Array.isArray(legs) || legs.length < 2) {
    return res.status(400).json({ error: 'legs must be an array with at least 2 entries' });
  }
  const stakeNum = Number(stake);
  if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
    return res.status(400).json({ error: 'stake must be a positive number' });
  }

  const parsed = legs.map((l) => ({
    marketId: Number((l as { marketId?: unknown }).marketId),
    selection: String((l as { selection?: unknown }).selection ?? '').trim(),
  }));
  if (parsed.some((l) => !Number.isInteger(l.marketId) || l.marketId <= 0 || l.selection === '')) {
    return res.status(400).json({ error: 'each leg needs a positive integer marketId and a non-empty selection' });
  }
  const seenMarkets = new Set<number>();
  for (const l of parsed) {
    if (seenMarkets.has(l.marketId)) {
      return res.status(400).json({ error: `duplicate market ${l.marketId} in legs` });
    }
    seenMarkets.add(l.marketId);
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }

  const marketRows = parsed.map((l) =>
    db
      .prepare('SELECT id, match_id, status FROM markets WHERE id = ?')
      .get(l.marketId) as { id: number; match_id: number; status: string } | undefined,
  );
  for (let i = 0; i < marketRows.length; i++) {
    const m = marketRows[i];
    if (!m) {
      return res.status(404).json({ error: `market ${parsed[i].marketId} not found` });
    }
    if (m.status !== 'open') {
      return res.status(409).json({ error: `market ${m.id} is ${m.status}, cannot place bet` });
    }
  }
  const matchIds = marketRows.map((m) => (m as { match_id: number }).match_id);
  if (new Set(matchIds).size !== matchIds.length) {
    return res.status(400).json({ error: 'all legs must be on different matches' });
  }

  const legsData: Array<{ marketId: number; selection: string; price: number }> = [];
  let combined = 1;
  for (let i = 0; i < parsed.length; i++) {
    const oddsRow = db
      .prepare('SELECT price FROM odds WHERE market_id = ? AND selection = ?')
      .get(parsed[i].marketId, parsed[i].selection) as { price: number } | undefined;
    if (!oddsRow) {
      return res
        .status(400)
        .json({ error: `selection "${parsed[i].selection}" not available on market ${parsed[i].marketId}` });
    }
    legsData.push({ marketId: parsed[i].marketId, selection: parsed[i].selection, price: oddsRow.price });
    combined = round2(combined * oddsRow.price);
  }
  if (combined > 10000) {
    return res.status(400).json({ error: 'combined odds too large (max 10000)' });
  }

  const riskErr = checkRisk({ stake: stakeNum, price: combined, userId: uid });
  if (riskErr) {
    return res.status(400).json({ error: riskErr });
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
        `INSERT INTO bets (user_id, market_id, selection, bet_type, price, stake, potential_payout)
         VALUES (?, NULL, NULL, 'parlay', ?, ?, ?)`,
      )
      .run(uid, combined, stakeNum, round2(stakeNum * combined));
    const betId = Number(info.lastInsertRowid);
    db.prepare(
      'INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
    ).run(acc.id, 'bet_stake', -stakeNum, 'bet', betId);
    const insertLeg = db.prepare(
      'INSERT INTO bet_legs (bet_id, market_id, selection, price) VALUES (?, ?, ?, ?)',
    );
    for (const leg of legsData) {
      insertLeg.run(betId, leg.marketId, leg.selection, leg.price);
    }
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
// 普通用户只能查自己的；admin 可查全部或任意用户
betsRouter.get('/bets', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const q = req.query.userId;
  let uid: number | undefined;
  if (q !== undefined) {
    const parsed = Number(q);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'userId must be a positive integer' });
    }
    if (me.role !== 'admin' && parsed !== me.id) {
      return res.status(403).json({ error: '只能查看自己的投注记录' });
    }
    uid = parsed;
  } else if (me.role !== 'admin') {
    uid = me.id;
  }
  const rows = (uid === undefined
    ? db.prepare('SELECT * FROM bets ORDER BY id DESC').all()
    : db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC').all(uid)) as BetRow[];
  const list = rows.map((b) => getBetDetail(b.id));
  res.json({ count: list.length, bets: list });
});

// GET /bets/:id — single bet detail（普通用户只能看自己的）
betsRouter.get('/bets/:id', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid bet id' });
  }
  const bet = getBetDetail(id);
  if (!bet) {
    return res.status(404).json({ error: 'bet not found' });
  }
  if (me.role !== 'admin' && bet.user_id !== me.id) {
    return res.status(403).json({ error: '只能查看自己的投注记录' });
  }
  res.json({ bet });
});
