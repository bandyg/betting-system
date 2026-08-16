import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';

export const crmRouter = Router();

interface PromotionRow {
  id: number;
  title: string;
  description: string;
  bonus_type: 'deposit_bonus' | 'free_bet';
  bonus_value: number;
  min_deposit: number;
  status: 'active' | 'expired';
  start_at: string | null;
  end_at: string | null;
  created_at: string;
}

const BONUS_TYPES = ['deposit_bonus', 'free_bet'] as const;

/** POST /api/crm/promotions — 创建促销活动（仅 admin） */
crmRouter.post('/crm/promotions', requireAuth, requireRole('admin'), (req, res) => {
  const { title, description, bonus_type, bonus_value, min_deposit, start_at, end_at } = req.body ?? {};
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
  const stmt = db.prepare(
    `INSERT INTO promotions (title, description, bonus_type, bonus_value, min_deposit, start_at, end_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(
    title.trim(),
    description ?? '',
    bonus_type,
    value,
    Number.isFinite(minDep) && minDep >= 0 ? minDep : 0,
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

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const existing = db.prepare('SELECT id FROM promotion_claims WHERE promotion_id = ? AND user_id = ?').get(promotionId, userId);
  if (existing) return res.status(409).json({ error: 'already claimed' });

  db.prepare('INSERT INTO promotion_claims (promotion_id, user_id) VALUES (?, ?)').run(promotionId, userId);
  res.status(201).json({ claimed: true, promotion: promo });
});

/** GET /api/crm/promotions/:id/claims?userId= — 查询是否已领取（普通用户只能查自己；admin 可查任意） */
crmRouter.get('/crm/promotions/:id/claims', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const promotionId = Number(req.params.id);
  const q = req.query.userId;
  let userId = me.id;
  if (q !== undefined) {
    const parsed = Number(q);
    if (me.role !== 'admin' && parsed !== me.id) {
      return res.status(403).json({ error: '只能查询自己的领取记录' });
    }
    userId = parsed;
  }
  const row = db.prepare('SELECT * FROM promotion_claims WHERE promotion_id = ? AND user_id = ?').get(promotionId, userId);
  res.json({ claimed: !!row });
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
