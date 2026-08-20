import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole, type AuthedUser } from './middleware.js';

export const crmRouter = Router();

interface PromotionRow {
  id: number;
  title: string;
  description: string;
  bonus_type: 'deposit_bonus' | 'free_bet';
  bonus_value: number;
  min_deposit: number;
  max_claims_per_user: number;
  wagering_multiplier: number;
  status: 'active' | 'expired';
  start_at: string | null;
  end_at: string | null;
  created_at: string;
}

interface PromotionClaimRow {
  id: number;
  promotion_id: number;
  user_id: number;
  status: 'pending' | 'approved' | 'rejected';
  bonus_amount: number;
  wagering_required: number;
  wagering_done: number;
  approved_at: string | null;
  created_at: string;
}

const BONUS_TYPES = ['deposit_bonus', 'free_bet'] as const;

/** 活动是否在有效期内（未开始/已结束 → 视为不可领取） */
function promotionLive(promo: PromotionRow, now: Date): boolean {
  if (promo.start_at && now < new Date(promo.start_at)) return false;
  if (promo.end_at && now > new Date(promo.end_at)) return false;
  return true;
}

/** 用户已领取该活动的次数（含 pending/approved/rejected 全部记录） */
function claimCount(promotionId: number, userId: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM promotion_claims WHERE promotion_id = ? AND user_id = ?')
    .get(promotionId, userId) as { n: number };
  return row.n;
}

/** 用户历史充值总额（transactions type=deposit） */
function userTotalDeposits(userId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(t.amount), 0) AS total FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE a.user_id = ? AND t.type = 'deposit'`,
    )
    .get(userId) as { total: number };
  return row.total;
}

/** 创建促销活动（仅 admin） */
crmRouter.post('/crm/promotions', requireAuth, requireRole('admin'), (req, res) => {
  const { title, description, bonus_type, bonus_value, min_deposit, max_claims_per_user, wagering_multiplier, start_at, end_at } = req.body ?? {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!BONUS_TYPES.includes(bonus_type)) {
    return res.status(400).json({ error: `bonus_type must be one of: ${BONUS_TYPES.join(', ')}` });
  }
  const value = Number(bonus_value);
  if (!Number.isFinite(value) || value < 0) {
    return res.status(400).json({ error: 'bonus_value must be a non-negative number' });
  }
  const minDep = Number(min_deposit ?? 0);
  const maxClaims = Number(max_claims_per_user ?? 1);
  const wagering = Number(wagering_multiplier ?? 0);
  if (!Number.isInteger(maxClaims) || maxClaims < 1) {
    return res.status(400).json({ error: 'max_claims_per_user must be a positive integer' });
  }
  if (!Number.isFinite(wagering) || wagering < 0) {
    return res.status(400).json({ error: 'wagering_multiplier must be a non-negative number' });
  }
  const stmt = db.prepare(
    `INSERT INTO promotions (title, description, bonus_type, bonus_value, min_deposit, max_claims_per_user, wagering_multiplier, start_at, end_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    title.trim(),
    description ?? '',
    bonus_type,
    value,
    Number.isFinite(minDep) && minDep >= 0 ? minDep : 0,
    maxClaims,
    wagering,
    start_at ?? null,
    end_at ?? null
  );
  const row = db.prepare('SELECT * FROM promotions WHERE id = ?').get(info.lastInsertRowid) as PromotionRow;
  res.status(201).json({ promotion: row });
});

/** GET /api/crm/promotions?status=active — 活动列表 */
crmRouter.get('/crm/promotions', (req, res) => {
  const { status } = req.query;
  let rows: PromotionRow[];
  if (status === 'active' || status === 'expired') {
    rows = db.prepare('SELECT * FROM promotions WHERE status = ? ORDER BY created_at DESC').all(status) as PromotionRow[];
  } else {
    rows = db.prepare('SELECT * FROM promotions ORDER BY created_at DESC').all() as PromotionRow[];
  }
  res.json({ count: rows.length, promotions: rows });
});

/** POST /api/crm/promotions/:id/claim — 用户领取活动（userId 从登录 token 取） */
crmRouter.post('/crm/promotions/:id/claim', requireAuth, (req, res) => {
  const promotionId = Number(req.params.id);
  const userId = (res.locals.user as { id: number }).id;
  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(promotionId) as PromotionRow | undefined;
  if (!promo) return res.status(404).json({ error: 'promotion not found' });
  if (promo.status !== 'active') return res.status(409).json({ error: 'promotion is not active' });
  if (!promotionLive(promo, new Date())) {
    return res.status(409).json({ error: 'promotion is not within its valid period' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'user not found' });

  // 限领次数：同一活动最多领 max_claims_per_user 次
  if (claimCount(promotionId, userId) >= promo.max_claims_per_user) {
    return res.status(409).json({ error: 'claim limit reached for this promotion' });
  }

  // 存款门槛：deposit_bonus 需历史充值达标
  if (promo.bonus_type === 'deposit_bonus' && promo.min_deposit > 0) {
    const deposits = userTotalDeposits(userId);
    if (deposits < promo.min_deposit) {
      return res
        .status(409)
        .json({ error: `requires total deposits of at least ${promo.min_deposit} (current: ${deposits})` });
    }
  }

  // 重复 pending/approved 领取拦截（rejected 后允许重领）
  const open = db
    .prepare("SELECT id FROM promotion_claims WHERE promotion_id = ? AND user_id = ? AND status != 'rejected'")
    .get(promotionId, userId);
  if (open) return res.status(409).json({ error: 'already claimed (pending or approved)' });

  const info = db
    .prepare('INSERT INTO promotion_claims (promotion_id, user_id, status) VALUES (?, ?, ?)')
    .run(promotionId, userId, 'pending');
  const claim = db
    .prepare('SELECT * FROM promotion_claims WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as PromotionClaimRow;
  res.status(201).json({ claim, promotion: promo });
});

/** POST /api/crm/promotions/:id/claims/:claimId/approve — admin 审核通过，发放 bonus + 设定流水要求 */
crmRouter.post('/crm/promotions/:id/claims/:claimId/approve', requireAuth, requireRole('admin'), (req, res) => {
  const promotionId = Number(req.params.id);
  const claimId = Number(req.params.claimId);
  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(promotionId) as PromotionRow | undefined;
  const claim = db.prepare('SELECT * FROM promotion_claims WHERE id = ? AND promotion_id = ?').get(claimId, promotionId) as PromotionClaimRow | undefined;
  if (!promo || !claim) return res.status(404).json({ error: 'promotion or claim not found' });
  if (claim.status !== 'pending') return res.status(409).json({ error: `claim is already ${claim.status}` });

  const acc = db.prepare('SELECT id, balance, bonus_balance FROM accounts WHERE user_id = ?').get(claim.user_id) as {
    id: number;
    balance: number;
    bonus_balance: number;
  };
  const bonusAmount = promo.bonus_value;
  const wageringRequired = Math.round(promo.bonus_value * promo.wagering_multiplier * 100) / 100;

  const approve = db.transaction(() => {
    // 有流水要求 → 先进 bonus_balance（不可直接提现）；无流水要求 → 直接进主余额
    if (wageringRequired > 0) {
      db.prepare("UPDATE accounts SET bonus_balance = ?, updated_at = datetime('now') WHERE id = ?").run(
        Math.round((acc.bonus_balance + bonusAmount) * 100) / 100,
        acc.id,
      );
      db.prepare(
        'INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
      ).run(acc.id, 'bonus', bonusAmount, 'promotion', claimId);
    } else {
      db.prepare("UPDATE accounts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
        Math.round((acc.balance + bonusAmount) * 100) / 100,
        acc.id,
      );
      db.prepare(
        'INSERT INTO transactions (account_id, type, amount, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
      ).run(acc.id, 'bonus', bonusAmount, 'promotion', claimId);
    }
    db.prepare(
      `UPDATE promotion_claims SET status = 'approved', bonus_amount = ?, wagering_required = ?, approved_at = datetime('now') WHERE id = ?`,
    ).run(bonusAmount, wageringRequired, claimId);
  });
  approve();

  const updated = db.prepare('SELECT * FROM promotion_claims WHERE id = ?').get(claimId) as PromotionClaimRow;
  const accountAfter = db.prepare('SELECT id, balance, bonus_balance FROM accounts WHERE user_id = ?').get(claim.user_id) as {
    id: number;
    balance: number;
    bonus_balance: number;
  };
  res.json({ claim: updated, account: accountAfter });
});

/** POST /api/crm/promotions/:id/claims/:claimId/reject — admin 审核拒绝（不发放） */
crmRouter.post('/crm/promotions/:id/claims/:claimId/reject', requireAuth, requireRole('admin'), (req, res) => {
  const promotionId = Number(req.params.id);
  const claimId = Number(req.params.claimId);
  const claim = db.prepare('SELECT * FROM promotion_claims WHERE id = ? AND promotion_id = ?').get(claimId, promotionId) as PromotionClaimRow | undefined;
  if (!claim) return res.status(404).json({ error: 'claim not found' });
  if (claim.status !== 'pending') return res.status(409).json({ error: `claim is already ${claim.status}` });
  db.prepare("UPDATE promotion_claims SET status = 'rejected' WHERE id = ?").run(claimId);
  const updated = db.prepare('SELECT * FROM promotion_claims WHERE id = ?').get(claimId) as PromotionClaimRow;
  res.json({ claim: updated });
});

/** GET /api/crm/promotions/:id/claims — 查看领取记录（普通用户只能看自己；admin 可查全部） */
crmRouter.get('/crm/promotions/:id/claims', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const promotionId = Number(req.params.id);
  const q = req.query.userId;
  let rows: PromotionClaimRow[];
  if (me.role === 'admin' && q === undefined) {
    rows = db
      .prepare('SELECT * FROM promotion_claims WHERE promotion_id = ? ORDER BY id DESC')
      .all(promotionId) as PromotionClaimRow[];
  } else {
    const parsed = q === undefined ? me.id : Number(q);
    if (me.role !== 'admin' && parsed !== me.id) {
      return res.status(403).json({ error: '只能查询自己的领取记录' });
    }
    rows = db
      .prepare('SELECT * FROM promotion_claims WHERE promotion_id = ? AND user_id = ? ORDER BY id DESC')
      .all(promotionId, parsed) as PromotionClaimRow[];
  }
  res.json({ count: rows.length, claims: rows });
});

/* ---------------- 用户偏好 (CRM 细分) ---------------- */

interface PrefRow {
  user_id: number;
  favorite_team: string | null;
  marketing_opt_in: number;
  created_at: string;
  updated_at: string;
}

/** GET /api/users/:id/preferences — 查偏好（普通用户只能查自己；admin 可查任意） */
crmRouter.get('/users/:id/preferences', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const userId = Number(req.params.id);
  if (me.role !== 'admin' && me.id !== userId) {
    return res.status(403).json({ error: '只能查看自己的偏好设置' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  let row = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as PrefRow | undefined;
  if (!row) {
    db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as PrefRow;
  }
  res.json({ preferences: { favorite_team: row.favorite_team, marketing_opt_in: !!row.marketing_opt_in } });
});

/** PUT /api/users/:id/preferences — 更新偏好（普通用户只能改自己；admin 可改任意） */
crmRouter.put('/users/:id/preferences', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const userId = Number(req.params.id);
  if (me.role !== 'admin' && me.id !== userId) {
    return res.status(403).json({ error: '只能修改自己的偏好设置' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const existing = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as PrefRow | undefined;
  if (!existing) db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);

  const { favorite_team, marketing_opt_in } = req.body ?? {};
  const newTeam = favorite_team !== undefined ? String(favorite_team) : (existing?.favorite_team ?? null);
  const newOptIn = marketing_opt_in !== undefined ? (marketing_opt_in ? 1 : 0) : (existing?.marketing_opt_in ?? 1);

  db.prepare(
    `UPDATE user_preferences SET favorite_team = ?, marketing_opt_in = ?, updated_at = datetime('now') WHERE user_id = ?`
  ).run(newTeam, newOptIn, userId);
  const row = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as PrefRow;
  res.json({ preferences: { favorite_team: row.favorite_team, marketing_opt_in: !!row.marketing_opt_in } });
});

/* ---------------- VIP 等级（CRM 忠诚度计划） ---------------- */

interface VipTierRow {
  tier: string;
  min_lifetime_stake: number;
  max_lifetime_stake: number | null;
  cashback_rate: number;
  fee_discount: number;
  badge: string;
  perks: string;
}

function listVipTiers(): VipTierRow[] {
  return db.prepare('SELECT * FROM vip_tiers ORDER BY min_lifetime_stake').all() as VipTierRow[];
}

/** 用户累计投注额（settled 的 bet_stake 总额，不含 void 退款） */
function lifetimeStake(userId: number): number {
  const row = db.prepare(
    `SELECT COALESCE(SUM(t.amount), 0) AS total FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE a.user_id = ? AND t.type = 'bet_stake'`,
  ).get(userId) as { total: number };
  return row.total;
}

/** 根据累计投注额计算当前等级 + 下一级进度 */
export function computeVip(userId: number): { tier: string; next: string | null; progress: number; stake: number; tiers: VipTierRow[] } {
  const tiers = listVipTiers();
  const stake = lifetimeStake(userId);
  let current = tiers[0];
  let next: VipTierRow | null = null;
  for (const t of tiers) {
    if (stake >= t.min_lifetime_stake) {
      current = t;
    } else {
      next = t;
      break;
    }
  }
  const progress = next == null ? 1 : Math.min(1, Math.max(0, (stake - current.min_lifetime_stake) / (next.min_lifetime_stake - current.min_lifetime_stake)));
  return { tier: current.tier, next: next?.tier ?? null, progress, stake, tiers };
}

/** GET /api/vip/tiers — 全部等级定义（登录用户可看，仅展示用） */
crmRouter.get('/vip/tiers', requireAuth, (req, res) => {
  res.json({ tiers: listVipTiers() });
});

/** GET /api/vip/me — 我的等级 + 升级进度 + 权益（登录用户） */
crmRouter.get('/vip/me', requireAuth, (req, res) => {
  const me = res.locals.user as AuthedUser;
  res.json({ vip: computeVip(me.id) });
});
