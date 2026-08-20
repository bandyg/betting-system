// feeds/settle.ts (P4) — reusable idempotent settlement core, extracted from routes/settle.ts.
// settleMatch(db, matchId) settles every open market of a finished match inside ONE transaction:
//   winners get payout (balance += stake * price), losers nothing, pushes get stake refund (void).
//   All bets/markets/match move to 'settled'. Safe to call repeatedly (already-settled → skipped).
// Parlays: each leg is settled when ITS market settles; the ticket settles only when ALL legs are settled.
import type { Database } from 'better-sqlite3';
import { accumulateWagering } from './wagering.js';

export interface MarketSummary {
  marketId: number;
  type: '1x2' | 'ah' | 'ou';
  line: number | null;
  openBets: number;
  won: number;
  lost: number;
  void: number;
  payoutAmount: number;
  refundAmount: number;
}

export type SettleMatchResult =
  | { status: 'settled'; bets: number; payouts: number; summary: MarketSummary[]; totalPayout: number; totalRefund: number; parlaySummary: ParlaySummary[] }
  | { status: 'skipped'; reason: 'not_found' | 'no_score' | 'already_settled'; bets: number; payouts: number };

export interface ParlaySummary {
  betId: number;
  userId: number;
  legs: number;
  won: number;
  lost: number;
  void: number;
  outcome: 'won' | 'lost' | 'void' | 'pending';
  payoutAmount: number;
  refundAmount: number;
}

type MatchRow = {
  id: number;
  status: 'scheduled' | 'finished' | 'settled';
  home_score: number | null;
  away_score: number | null;
};

type MarketRow = {
  id: number;
  type: '1x2' | 'ah' | 'ou';
  line: number | null;
};

type OpenBetRow = {
  id: number;
  user_id: number;
  selection: string;
  price: number;
  stake: number;
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

/**
 * Settle one match idempotently. Single transaction; verbatim port of the old
 * `POST /matches/:id/settle` inline logic (selectionOutcome / round2 / payout / refund).
 * Already-settled or missing final score → `{ status: 'skipped' }` (no-op, no money moved).
 * On success also returns the per-market summary + totals so the admin route can reply with
 * the exact historical JSON shape.
 */
export function settleMatch(db: Database, matchId: number): SettleMatchResult {
  const match = db.prepare('SELECT id, status, home_score, away_score FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined;
  if (!match) return { status: 'skipped', reason: 'not_found', bets: 0, payouts: 0 };
  if (match.status === 'settled') return { status: 'skipped', reason: 'already_settled', bets: 0, payouts: 0 };
  if (match.home_score === null || match.away_score === null) return { status: 'skipped', reason: 'no_score', bets: 0, payouts: 0 };

  const openMarkets = db
    .prepare('SELECT * FROM markets WHERE match_id = ? AND status = ? ORDER BY id')
    .all(matchId, 'open') as MarketRow[];

  const { summary, parlaySummary, totalPayout, totalRefund } = db.transaction(() => {
    const summary: MarketSummary[] = [];
    const parlaySummary: ParlaySummary[] = [];
    let totalPayout = 0;
    let totalRefund = 0;

    for (const market of openMarkets) {
      const bets = db
        .prepare('SELECT * FROM bets WHERE market_id = ? AND bet_type = ? AND status = ?')
        .all(market.id, 'single', 'open') as OpenBetRow[];

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
          accumulateWagering(db, bet.user_id, bet.stake);
        } else if (outcome === 'lost') {
          settleBet.run('lost', bet.id);
          lost += 1;
          accumulateWagering(db, bet.user_id, bet.stake);
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

      const legs = db
        .prepare(
          `SELECT bl.id, bl.bet_id, bl.selection, bl.price, b.user_id, b.stake, b.price AS combined_price
           FROM bet_legs bl JOIN bets b ON b.id = bl.bet_id
           WHERE bl.market_id = ? AND bl.status = ? AND b.status = ?`,
        )
        .all(market.id, 'open', 'open') as Array<{
        id: number;
        bet_id: number;
        selection: string;
        price: number;
        user_id: number;
        stake: number;
        combined_price: number;
      }>;

      const settleLeg = db.prepare(
        `UPDATE bet_legs SET status = ?, settled_at = datetime('now') WHERE id = ?`,
      );
      for (const leg of legs) {
        const outcome = selectionOutcome(
          market.type,
          leg.selection,
          market.line,
          match.home_score as number,
          match.away_score as number,
        );
        settleLeg.run(outcome, leg.id);
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

    const openParlays = db
      .prepare(
        `SELECT DISTINCT b.id, b.user_id, b.stake, b.price
         FROM bets b
         JOIN bet_legs bl ON bl.bet_id = b.id
         JOIN markets m ON m.id = bl.market_id
         WHERE b.bet_type = 'parlay' AND b.status = 'open' AND m.match_id = ?
         ORDER BY b.id`,
      )
      .all(matchId) as Array<{ id: number; user_id: number; stake: number; price: number }>;

    for (const parlay of openParlays) {
      const legRows = db
        .prepare('SELECT id, status FROM bet_legs WHERE bet_id = ?')
        .all(parlay.id) as Array<{ id: number; status: string }>;
      if (legRows.some((l) => l.status === 'open')) continue;

      let nWon = 0;
      let nLost = 0;
      let nVoid = 0;
      for (const l of legRows) {
        if (l.status === 'won') nWon += 1;
        else if (l.status === 'lost') nLost += 1;
        else nVoid += 1;
      }

      const settleTicket = db.prepare(
        `UPDATE bets SET status = ?, settled_at = datetime('now') WHERE id = ?`,
      );
      let outcome: 'won' | 'lost' | 'void' = 'won';
      let payoutAmount = 0;
      let refundAmount = 0;

      if (nLost > 0) {
        outcome = 'lost';
        settleTicket.run('lost', parlay.id);
        accumulateWagering(db, parlay.user_id, parlay.stake);
      } else if (nWon === legRows.length) {
        outcome = 'won';
        settleTicket.run('won', parlay.id);
        const payout = round2(parlay.stake * parlay.price);
        payoutAmount = payout;
        totalPayout += payout;
        const acc = db
          .prepare('SELECT id, balance FROM accounts WHERE user_id = ?')
          .get(parlay.user_id) as { id: number; balance: number };
        db.prepare(
          "UPDATE accounts SET balance = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(round2(acc.balance + payout), acc.id);
        db.prepare(
          'INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
        ).run(acc.id, 'payout', payout, 'bet', parlay.id);
        accumulateWagering(db, parlay.user_id, parlay.stake);
      } else {
        outcome = 'void';
        settleTicket.run('void', parlay.id);
        refundAmount = parlay.stake;
        totalRefund += parlay.stake;
        const acc = db
          .prepare('SELECT id, balance FROM accounts WHERE user_id = ?')
          .get(parlay.user_id) as { id: number; balance: number };
        db.prepare(
          "UPDATE accounts SET balance = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(round2(acc.balance + parlay.stake), acc.id);
        db.prepare(
          'INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
        ).run(acc.id, 'void_refund', parlay.stake, 'bet', parlay.id);
      }

      parlaySummary.push({
        betId: parlay.id,
        userId: parlay.user_id,
        legs: legRows.length,
        won: nWon,
        lost: nLost,
        void: nVoid,
        outcome,
        payoutAmount: round2(payoutAmount),
        refundAmount: round2(refundAmount),
      });
    }

    db.prepare("UPDATE matches SET status = 'settled' WHERE id = ?").run(matchId);

    return {
      summary,
      parlaySummary,
      totalPayout: round2(totalPayout),
      totalRefund: round2(totalRefund),
    };
  })();

  const bets = openMarkets.reduce((n, mk) => n + (summary.find((s) => s.marketId === mk.id)?.openBets ?? 0), 0);
  return {
    status: 'settled',
    bets,
    payouts: round2(totalPayout + totalRefund),
    summary,
    parlaySummary,
    totalPayout,
    totalRefund,
  };
}