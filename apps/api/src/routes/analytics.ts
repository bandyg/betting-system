import { Router, type Request, type Response } from 'express';
import { requireAuth, requireRole } from './middleware.js';
import { verifySessionToken } from '../jwt.js';
import db from '../db/index.js';
import {
  getDashboard,
  getTrends,
  getHotMatches,
  getUserAnalytics,
} from '../analytics.js';
import { csvFromObjects } from '../csv.js';

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

// ─── R13: 实时大屏（SSE）───

const REALTIME_INTERVAL_S = Math.max(2, Number(process.env.ANALYTICS_REALTIME_INTERVAL_S ?? '5'));
const REALTIME_MAX_CLIENTS = Number(process.env.ANALYTICS_REALTIME_MAX_CLIENTS ?? '10');
let realtimeClients = 0;

/**
 * GET /analytics/realtime?token=<JWT> — SSE 实时推送 dashboard 快照。
 *
 * 认证双通道（EventSource 无法设 Authorization 头的标准解法）：
 *   1. Authorization: Bearer <JWT>（fetch / 脚本）
 *   2. ?token=<JWT> 查询参数（浏览器 EventSource）
 * admin-only。每 REALTIME_INTERVAL_S 秒推一次 `data: {dashboard, ws, ts}`；客户端断开自动清理。
 */
analyticsRouter.get('/analytics/realtime', (req: Request, res: Response) => {
  // 手动认证（requireAuth 读 header，这里额外支持 ?token=）
  const bearer = (req.headers.authorization ?? '').startsWith('Bearer ')
    ? (req.headers.authorization as string).slice(7).trim()
    : '';
  const token = bearer || String(req.query.token ?? '');
  const uid = token ? verifySessionToken(token) : null;
  if (uid === null) {
    return res.status(401).json({ error: '未登录：缺少有效 token' });
  }
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(uid) as { id: number; role: string } | undefined;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: '没有权限执行此操作' });
  }

  // 连接数上限（防 SSE 泄漏拖垮进程）
  if (realtimeClients >= REALTIME_MAX_CLIENTS) {
    return res.status(429).json({ error: '实时连接数已达上限，请稍后重试' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  realtimeClients += 1;

  const push = () => {
    try {
      res.write(`data: ${JSON.stringify({ dashboard: getDashboard(), ws: realtimeClients, ts: Date.now() })}\n\n`);
    } catch {
      clearInterval(iv);
    }
  };
  push(); // 立即推首帧
  const iv = setInterval(push, REALTIME_INTERVAL_S * 1000);
  req.on('close', () => {
    clearInterval(iv);
    realtimeClients = Math.max(0, realtimeClients - 1);
  });
});

// ─── R13: CSV 导出（admin-only）───

function sendCsv(res: Response, filename: string, items: Record<string, unknown>[], headers?: string[]): void {
  const csv = csvFromObjects(items as Record<string, string | number | boolean | null>[], headers);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// GET /analytics/export/trends.csv?days=14
analyticsRouter.get('/analytics/export/trends.csv', requireAuth, requireRole('admin'), (req, res) => {
  const days = Number(req.query.days ?? 14);
  sendCsv(res, `trends-${days}d.csv`, getTrends(days) as unknown as Record<string, unknown>[]);
});

// GET /analytics/export/users.csv?limit=100 — 用户画像
analyticsRouter.get('/analytics/export/users.csv', requireAuth, requireRole('admin'), (req, res) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 100)));
  sendCsv(res, 'users.csv', getUserAnalytics(limit) as unknown as Record<string, unknown>[]);
});

// GET /analytics/export/hot-matches.csv?limit=50 — 热门赛事
analyticsRouter.get('/analytics/export/hot-matches.csv', requireAuth, requireRole('admin'), (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 50)));
  sendCsv(res, 'hot-matches.csv', getHotMatches(limit) as unknown as Record<string, unknown>[]);
});