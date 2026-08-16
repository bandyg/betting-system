import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';

export const settleRouter = Router();

type MatchRow = {
  id: number;
  home_team: string;
  away_team: string;
  status: 'scheduled' | 'finished' | 'settled';
  home_score: number | null;
  away_score: number | null;
};

type MarketRow = {
  id: number;
  match_id: number;
  type: '1x2' | 'ah' | 'ou';
  line: number | null;
  status: 'open' | 'settled';
};

type OpenBetRow = {
  id: number;
  user_id: number;
  selection: string;
  price: number;
  stake: number;
  potential_payout: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Determine settlement outcome of a selection on a market given the final score.
// Returns 'won' | 'lost' | 'void' (void = push/refund, e.g. handicap or total lands exactly on line).
function selectionOutcome(
  type: '1x2' | 'ah' | 'ou',
  selection: string,
  line: number | null,
  homeScore: number,
  awayScore: number,
): 'won' | 'lost' | 'void' {
  if (type === '1x2') {
    const winner = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';
    return selection === winner ? 'won' : 'lost';
  }
  if (type === 'ah') {
    const homeAdj = homeScore + (line ?? 0);
    if (homeAdj > awayScore) return selection === 'home' ? 'won' : 'lost';
    if (homeAdj < awayScore) return selection === 'away' ? 'won' : 'lost';
    return 'void'; // push — refund stake
  }
  // ou
  const total = homeScore + awayScore;
  if (total > (line ?? 0)) return selection === 'over' ? 'won' : 'lost';
  if (total < (line ?? 0)) return selection === 'under' ? 'won' : 'lost';
  return 'void'; // push — refund stake
}

// POST /matches/:id/result — record final score, mark match finished（仅 admin）
// body: { homeScore, awayScore }
settleRouter.post('/matches/:id/result', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid match id' });
  }
  const homeScore = Number(req.body?.homeScore);
  const awayScore = Number(req.body?.awayScore);
  if (!Number.isInteger(homeScore) || homeScore < 0) {
    return res.status(400).json({ error: 'homeScore must be a non-negative integer' });
  }
  if (!Number.isInteger(awayScore) || awayScore < 0) {
    return res.status(400).json({ error: 'awayScore must be a non-negative integer' });
  }

  const match = db.prepare('SELECT id, status FROM matches WHERE id = ?').get(id) as
    | { id: number; status: string }
    | undefined;
  if (!match) {
    return res.status(404).json({ error: 'match not found' });
  }
  if (match.status === 'settled') {
    return res.status(409).json({ error: 'match already settled, result cannot be changed' });
  }

  db.prepare(
    `UPDATE matches SET home_score = ?, away_score = ?, status = 'finished' WHERE id = ?`,
  ).run(homeScore, awayScore, id);

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  res.json({ match: updated });
});

// POST /matches/:id/settle — batch-settle all open markets of a finished match（仅 admin）
//   winners get payout (balance += stake * price), losers get nothing, pushes get stake refund (void).
//   All bets/markets/match move to settled inside one transaction.
settleRouter.post('/matches/:id/settle', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid match id' });
  }

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
  if (!match) {
    return res.status(404).json({ error: 'match not found' });
  }
  if (match.home_score === null || match.away_score === null) {
    return res
      .status(400)
      .json({ error: 'match result not recorded yet — POST /matches/:id/result first' });
  }
  if (match.status === 'settled') {
    return res.status(409).json({ error: 'match already settled' });
  }

  const openMarkets = db
    .prepare('SELECT * FROM markets WHERE match_id = ? AND status = ? ORDER BY id')
    .all(id, 'open') as MarketRow[];

  const settle = db.transaction(() => {
    const summary = [];
    let totalPayout = 0;
    let totalRefund = 0;

    for (const market of openMarkets) {
      const bets = db
        .prepare('SELECT * FROM bets WHERE market_id = ? AND status = ?')
        .all(market.id, 'open') as OpenBetRow[];

      let won = 0;
      let lost = 0;
      let voided = 0;
      let payoutAmount = 0;
      let refundAmount = 0;

      const settleBet = db.prepare(
        `UPDATE bets SET status = ?, settled_at = datetime('now') WHERE id = ?`,
      );

      for (const bet of bets) {
        const outcome = selectionOutcome(
          market.type,
          bet.selection,
          market.line,
          match.home_score as number,
          match.away_score as number,
        );
        if (outcome === 'won') {
          settleBet.run('won', bet.id);
          won += 1;
          const payout = round2(bet.stake * bet.price);
          payoutAmount += payout;
          totalPayout += payout;
          const acc = db
            .prepare('SELECT id, balance FROM accounts WHERE user_id = ?')
            .get(bet.user_id) as { id: number; balance: number };
          db.prepare(
            "UPDATE accounts SET balance = ?, updated_at = datetime('now') WHERE id = ?",
          ).run(round2(acc.balance + payout), acc.id);
          db.prepare(
            'INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
          ).run(acc.id, 'payout', payout, 'bet', bet.id);
        } else if (outcome === 'lost') {
          settleBet.run('lost', bet.id);
          lost += 1;
        } else {
          settleBet.run('void', bet.id);
          voided += 1;
          refundAmount += bet.stake;
          totalRefund += bet.stake;
          const acc = db
            .prepare('SELECT id, balance FROM accounts WHERE user_id = ?')
            .get(bet.user_id) as { id: number; balance: number };
          db.prepare(
            "UPDATE accounts SET balance = ?, updated_at = datetime('now') WHERE id = ?",
          ).run(round2(acc.balance + bet.stake), acc.id);
          db.prepare(
            'INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
          ).run(acc.id, 'void_refund', bet.stake, 'bet', bet.id);
        }
      }

      db.prepare("UPDATE markets SET status = 'settled' WHERE id = ?").run(market.id);

      summary.push({
        marketId: market.id,
        type: market.type,
        line: market.line,
        openBets: bets.length,
        won,
        lost,
        void: voided,
        payoutAmount: round2(payoutAmount),
        refundAmount: round2(refundAmount),
      });
    }

    db.prepare("UPDATE matches SET status = 'settled' WHERE id = ?").run(id);

    return { summary, totalPayout: round2(totalPayout), totalRefund: round2(totalRefund) };
  });

  const result = settle();
  const matchAfter = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  res.json({ match: matchAfter, ...result });
});
