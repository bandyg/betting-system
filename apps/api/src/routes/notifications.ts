// notifications.ts routes — 用户收件箱 + admin 群发（站内信）

import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';

export const notificationsRouter = Router();

// 用户查自己的 notifications
notificationsRouter.get('/notifications', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number };
  const unreadOnly = req.query.unread === '1';
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
  const rows = db.prepare(
    unreadOnly
      ? `SELECT id, title, body, link, category, read_at, created_at FROM notifications
         WHERE user_id = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT ?`
      : `SELECT id, title, body, link, category, read_at, created_at FROM notifications
         WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(me.id, limit);
  const unreadCount = (db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(me.id) as { n: number }).n;
  res.json({ notifications: rows, unreadCount });
});

// 标记单条已读
notificationsRouter.post('/notifications/:id/read', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number };
  const id = Number(req.params.id);
  const r = db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL`).run(id, me.id);
  if (r.changes === 0) return res.status(404).json({ error: '消息不存在或已读' });
  res.json({ ok: true });
});

// 全部标记已读
notificationsRouter.post('/notifications/read-all', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number };
  const r = db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`).run(me.id);
  res.json({ ok: true, count: r.changes });
});

// admin 群发（不绑定 segment）
notificationsRouter.post('/admin/notifications/broadcast', requireAuth, requireRole('admin'), (req, res) => {
  const { user_ids, title, body, link = '', category = 'system' } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' });
  if (typeof body !== 'string') return res.status(400).json({ error: 'body required' });
  if (!Array.isArray(user_ids) || user_ids.length === 0) return res.status(400).json({ error: 'user_ids (non-empty array) required' });
  const ins = db.prepare(`INSERT INTO notifications (user_id, title, body, link, category) VALUES (?, ?, ?, ?, ?)`);
  const txn = db.transaction((uids: number[]) => {
    let n = 0;
    for (const uid of uids) { ins.run(uid, title, body, link, category); n += 1; }
    return n;
  });
  try {
    const n = txn(user_ids as number[]);
    res.status(201).json({ sent: n });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});