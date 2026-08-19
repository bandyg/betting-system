import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';

export const withdrawalsRouter = Router();

const METHODS = ['bank', 'crypto', 'usdt'] as const;
const WITHDRAW_MIN = 10;
const WITHDRAW_MAX = 50000;
const DAILY_WITHDRAW_LIMIT = 100000;

interface WithdrawalRow {
  id: number;
  wd_no: string;
  user_id: number;
  amount: number;
  method: string;
  account_info: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  reviewed_by: number | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
}

function genWdNo(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `WD${ts}${rand}`;
}

function todayWithdrawn(userId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM withdrawals
       WHERE user_id = ? AND status != 'rejected' AND date(created_at) = date('now')`,
    )
    .get(userId) as { total: number };
  return row.total;
}

/** POST /withdrawals — 提交提现申请（登录用户）
 *  body: { amount, method?, account_info? }
 *  校验：单笔限额 + 余额充足 + 日累计限额；pending 去重（同一用户同一金额未决只允许一笔） */
withdrawalsRouter.post('/withdrawals', requireAuth, (req, res) => {
  const user = res.locals.user as { id: number };
  const { amount, method = 'bank', account_info = '' } = req.body ?? {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'amount 必须是正数' });
  }
  if (amt < WITHDRAW_MIN || amt > WITHDRAW_MAX) {
    return res.status(400).json({ error: `amount 超出允许范围 (${WITHDRAW_MIN} ~ ${WITHDRAW_MAX})` });
  }
  if (!METHODS.includes(method)) {
    return res.status(400).json({ error: `method 必须是: ${METHODS.join(', ')}` });
  }
  const acc = db.prepare('SELECT id, balance FROM accounts WHERE user_id = ?').get(user.id) as
    | { id: number; balance: number }
    | undefined;
  if (!acc) return res.status(404).json({ error: 'account not found' });
  if (acc.balance < amt) {
    return res.status(400).json({ error: `余额不足：当前 ¥${acc.balance.toLocaleString()}` });
  }
  if (todayWithdrawn(user.id) + amt > DAILY_WITHDRAW_LIMIT) {
    return res.status(400).json({ error: `今日提现已达上限 (¥${DAILY_WITHDRAW_LIMIT.toLocaleString()})` });
  }
  const dup = db
    .prepare("SELECT id FROM withdrawals WHERE user_id = ? AND amount = ? AND status = 'pending'")
    .get(user.id, amt);
  if (dup) return res.status(409).json({ error: '同金额提现申请待审批中，请勿重复提交' });

  const wdNo = genWdNo();
  const info = db
    .prepare('INSERT INTO withdrawals (wd_no, user_id, amount, method, account_info) VALUES (?, ?, ?, ?, ?)')
    .run(wdNo, user.id, amt, method, String(account_info).slice(0, 200));
  const row = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(Number(info.lastInsertRowid)) as WithdrawalRow;
  res.status(201).json({ withdrawal: row });
});

/** GET /withdrawals — 我的提现记录；?all=1 全部（admin）；?status= 筛选 */
withdrawalsRouter.get('/withdrawals', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const { all, status } = req.query;
  const isAdmin = me.role === 'admin';
  const where: string[] = [];
  const params: unknown[] = [];
  if (all === '1') {
    if (!isAdmin) return res.status(403).json({ error: '只有 admin 可以查看全部提现记录' });
  } else {
    where.push('user_id = ?');
    params.push(me.id);
  }
  const valid = ['pending', 'approved', 'rejected', 'paid'];
  if (typeof status === 'string' && valid.includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  const rows = db
    .prepare(`SELECT * FROM withdrawals${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 100`)
    .all(...params) as WithdrawalRow[];
  res.json({ count: rows.length, withdrawals: rows });
});

/** POST /withdrawals/:id/approve — 审批通过（admin）：扣减余额 + 写流水 + 状态 approved */
withdrawalsRouter.post('/withdrawals/:id/approve', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id) as WithdrawalRow | undefined;
  if (!row) return res.status(404).json({ error: 'withdrawal not found' });
  if (row.status !== 'pending') {
    return res.status(409).json({ error: `提现已 ${row.status}，只能审批 pending 的申请` });
  }
  const admin = res.locals.user as { id: number };
  const doApprove = db.transaction(() => {
    const acc = db.prepare('SELECT id, balance FROM accounts WHERE user_id = ?').get(row.user_id) as
      | { id: number; balance: number }
      | undefined;
    if (!acc) throw new Error('account not found');
    if (acc.balance < row.amount) {
      throw new Error(`余额不足：用户账户余额 ¥${acc.balance.toLocaleString()}，无法打款 ¥${row.amount.toLocaleString()}`);
    }
    db.prepare("UPDATE accounts SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?").run(row.amount, acc.id);
    db.prepare("INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, 'payout', ?, 'withdrawal', ?)")
      .run(acc.id, -row.amount, row.id);
    db.prepare("UPDATE withdrawals SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").run(admin.id, row.id);
    return { balance: acc.balance - row.amount };
  });
  try {
    const result = doApprove();
    const updated = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id) as WithdrawalRow;
    res.json({ withdrawal: updated, account: { balance: result.balance } });
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});

/** POST /withdrawals/:id/reject — 驳回（admin）：写拒绝原因，余额不动 */
withdrawalsRouter.post('/withdrawals/:id/reject', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id) as WithdrawalRow | undefined;
  if (!row) return res.status(404).json({ error: 'withdrawal not found' });
  if (row.status !== 'pending') {
    return res.status(409).json({ error: `提现已 ${row.status}，只能驳回 pending 的申请` });
  }
  const admin = res.locals.user as { id: number };
  const reason = String(req.body?.reason ?? '').trim().slice(0, 200) || '未说明原因';
  db.prepare("UPDATE withdrawals SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), reject_reason = ? WHERE id = ?")
    .run(admin.id, reason, id);
  const updated = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id) as WithdrawalRow;
  res.json({ withdrawal: updated });
});

/** POST /withdrawals/:id/paid — 标记打款完成（admin；approved → paid，钱已在 approve 时扣） */
withdrawalsRouter.post('/withdrawals/:id/paid', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id) as WithdrawalRow | undefined;
  if (!row) return res.status(404).json({ error: 'withdrawal not found' });
  if (row.status !== 'approved') {
    return res.status(409).json({ error: `提现已 ${row.status}，只能标记 approved 的记录` });
  }
  db.prepare("UPDATE withdrawals SET status = 'paid', reviewed_at = datetime('now') WHERE id = ?").run(id);
  const updated = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id) as WithdrawalRow;
  res.json({ withdrawal: updated });
});