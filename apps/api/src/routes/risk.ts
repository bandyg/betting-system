import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';
import { getRiskLimits } from '../risk.js';

export const riskRouter = Router();

const FIELDS = ['min_stake', 'max_stake', 'min_odds', 'max_odds', 'max_daily_stake'] as const;

// GET /risk/limits — 读取当前风控限额（仅 admin）
riskRouter.get('/risk/limits', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({ limits: getRiskLimits() });
});

// PUT /risk/limits — 更新风控限额（仅 admin，支持部分更新）
// body: { min_stake?, max_stake?, min_odds?, max_odds?, max_daily_stake? }
riskRouter.put('/risk/limits', requireAuth, requireRole('admin'), (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const current = getRiskLimits();
  const next = { ...current };

  for (const f of FIELDS) {
    if (body[f] !== undefined) {
      const v = Number(body[f]);
      if (!Number.isFinite(v) || v <= 0) {
        return res.status(400).json({ error: `${f} 必须是正数` });
      }
      next[f] = v;
    }
  }

  if (next.min_stake >= next.max_stake) {
    return res.status(400).json({ error: 'min_stake 必须小于 max_stake' });
  }
  if (next.min_odds >= next.max_odds) {
    return res.status(400).json({ error: 'min_odds 必须小于 max_odds' });
  }

  db.prepare(
    `UPDATE risk_limits
     SET min_stake = ?, max_stake = ?, min_odds = ?, max_odds = ?, max_daily_stake = ?,
         updated_at = datetime('now')
     WHERE id = 1`,
  ).run(next.min_stake, next.max_stake, next.min_odds, next.max_odds, next.max_daily_stake);

  res.json({ limits: getRiskLimits() });
});
