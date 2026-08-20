import type { Database } from 'better-sqlite3';

type ApprovedClaim = {
  id: number;
  bonus_amount: number;
  wagering_required: number;
  wagering_done: number;
};

// 按创建顺序把结算成功的投注本金计入用户未解锁的 bonus 流水；
// 某 claim 达标后将其 bonus_amount 从 bonus_balance 转入主余额。
export function accumulateWagering(db: Database, userId: number, stakeAmount: number): void {
  const open = db
    .prepare(
      `SELECT id, bonus_amount, wagering_required, wagering_done
       FROM promotion_claims
       WHERE user_id = ? AND status = 'approved' AND wagering_required > wagering_done
       ORDER BY id ASC`,
    )
    .all(userId) as ApprovedClaim[];

  let remaining = stakeAmount;
  for (const claim of open) {
    if (remaining <= 0) break;
    const needed = claim.wagering_required - claim.wagering_done;
    const add = Math.min(needed, remaining);
    db.prepare('UPDATE promotion_claims SET wagering_done = wagering_done + ? WHERE id = ?').run(add, claim.id);
    remaining -= add;
    if (claim.wagering_done + add >= claim.wagering_required) {
      releaseBonus(db, userId, claim.id, claim.bonus_amount);
    }
  }
}

function releaseBonus(db: Database, userId: number, claimId: number, amount: number): void {
  const acc = db
    .prepare('SELECT id, balance, bonus_balance FROM accounts WHERE user_id = ?')
    .get(userId) as { id: number; balance: number; bonus_balance: number } | undefined;
  if (!acc) return;
  db.prepare(
    `UPDATE accounts SET bonus_balance = ?, balance = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(
    Math.round((acc.bonus_balance - amount) * 100) / 100,
    Math.round((acc.balance + amount) * 100) / 100,
    acc.id,
  );
  db.prepare(
    `INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, 'bonus', ?, 'promotion_release', ?)`,
  ).run(acc.id, amount, claimId);
}