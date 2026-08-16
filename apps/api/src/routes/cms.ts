import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';

export const cmsRouter = Router();

interface ContentRow {
  id: number;
  title: string;
  type: 'announcement' | 'promotion' | 'article';
  body: string;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
}

const CONTENT_TYPES = ['announcement', 'promotion', 'article'] as const;

/** POST /api/cms/contents — 创建内容（默认草稿，仅 admin） */
cmsRouter.post('/cms/contents', requireAuth, requireRole('admin'), (req, res) => {
  const { title, type, body } = req.body ?? {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!CONTENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${CONTENT_TYPES.join(', ')}` });
  }
  const stmt = db.prepare(
    `INSERT INTO contents (title, type, body, status) VALUES (?, ?, ?, 'draft')`
  );
  const info = stmt.run(title.trim(), type, body ?? '');
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(info.lastInsertRowid) as ContentRow;
  res.status(201).json({ content: row });
});

/** GET /api/cms/contents?status=published — 内容列表（published 公开；draft/全部仅 admin） */
cmsRouter.get('/cms/contents', (req, res) => {
  const { status } = req.query;
  if (status !== 'published') {
    // 非公开查询（draft 或全部）需要 admin
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const row = token
      ? (db
          .prepare(
            `SELECT u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
          )
          .get(token) as { role: string } | undefined)
      : undefined;
    if (row?.role !== 'admin') {
      return res.status(403).json({ error: '没有权限查看草稿内容' });
    }
  }
  let rows: ContentRow[];
  if (status === 'published' || status === 'draft') {
    rows = db.prepare('SELECT * FROM contents WHERE status = ? ORDER BY updated_at DESC').all(status) as ContentRow[];
  } else {
    rows = db.prepare('SELECT * FROM contents ORDER BY updated_at DESC').all() as ContentRow[];
  }
  res.json({ count: rows.length, contents: rows });
});

/** GET /api/cms/contents/:id — 单条内容 */
cmsRouter.get('/cms/contents/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(Number(req.params.id)) as ContentRow | undefined;
  if (!row) return res.status(404).json({ error: 'content not found' });
  res.json({ content: row });
});

/** PUT /api/cms/contents/:id — 编辑内容（仅 admin） */
cmsRouter.put('/cms/contents/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow | undefined;
  if (!existing) return res.status(404).json({ error: 'content not found' });

  const { title, type, body } = req.body ?? {};
  const newTitle = title !== undefined ? String(title).trim() : existing.title;
  const newType = type !== undefined ? String(type) : existing.type;
  const newBody = body !== undefined ? String(body) : existing.body;

  if (!newTitle) return res.status(400).json({ error: 'title cannot be empty' });
  if (!CONTENT_TYPES.includes(newType as (typeof CONTENT_TYPES)[number])) {
    return res.status(400).json({ error: `type must be one of: ${CONTENT_TYPES.join(', ')}` });
  }

  db.prepare(
    `UPDATE contents SET title = ?, type = ?, body = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(newTitle, newType, newBody, id);
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow;
  res.json({ content: row });
});

/** POST /api/cms/contents/:id/publish — 发布内容（仅 admin） */
cmsRouter.post('/cms/contents/:id/publish', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow | undefined;
  if (!existing) return res.status(404).json({ error: 'content not found' });
  db.prepare(`UPDATE contents SET status = 'published', updated_at = datetime('now') WHERE id = ?`).run(id);
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow;
  res.json({ content: row });
});
