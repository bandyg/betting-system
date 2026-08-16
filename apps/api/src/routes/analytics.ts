import { Router } from 'express';
import { requireAuth, requireRole } from './middleware.js';
import {
  getDashboard,
  getTrends,
  getHotMatches,
  getUserAnalytics,
} from '../analytics.js';

export const analyticsRouter = Router();

// 所有 analytics 端点只读且仅 admin

// GET /analytics/dashboard — 运营总览
analyticsRouter.get('/analytics/dashboard', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({ dashboard: getDashboard() });
});

// GET /analytics/trends?days=14 — 按日投注/派彩趋势
analyticsRouter.get('/analytics/trends', requireAuth, requireRole('admin'), (req, res) => {
  const days = Number(req.query.days ?? 14);
  res.json({ trends: getTrends(days) });
});

// GET /analytics/hot-matches?limit=10 — 热门赛事 Top N（按下注额）
analyticsRouter.get('/analytics/hot-matches', requireAuth, requireRole('admin'), (req, res) => {
  const limit = Number(req.query.limit ?? 10);
  res.json({ matches: getHotMatches(limit) });
});

// GET /analytics/users?limit=10 — 用户画像 Top N（按投注额）
analyticsRouter.get('/analytics/users', requireAuth, requireRole('admin'), (req, res) => {
  const limit = Number(req.query.limit ?? 10);
  res.json({ users: getUserAnalytics(limit) });
});