// feeds/settle.ts (P4) — reusable idempotent settlement core, extracted from routes/settle.ts.
// settleMatch(db, matchId) settles every open market of a finished match inside ONE transaction:
//   winners get payout (balance += stake * price), losers nothing, pushes get stake refund (void).
//   All bets/markets/match move to 'settled'. Safe to call repeatedly (already-settled → skipped).
import type { Database } from 'better-sqlite3';

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
  | { status: 'settled'; bets: number; payouts: number; summary: MarketSummary[]; totalPayout: number; totalRefund: number }
  | { status: 'skipped'; reason: 'not_found' | 'no_score' | 'already_settled'; bets: number; payouts: number };

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

  const { summary, totalPayout, totalRefund } = db.transaction(() => {
    const summary: MarketSummary[] = [];
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

    db.prepare("UPDATE matches SET status = 'settled' WHERE id = ?").run(matchId);

    return { summary, totalPayout: round2(totalPayout), totalRefund: round2(totalRefund) };
  })();

  const bets = openMarkets.reduce((n, mk) => n + (summary.find((s) => s.marketId === mk.id)?.openBets ?? 0), 0);
  return {
    status: 'settled',
    bets,
    payouts: round2(totalPayout + totalRefund),
    summary,
    totalPayout,
    totalRefund,
  };
}