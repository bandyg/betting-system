import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';

export const cmsRouter = Router();

interface ContentRow {
  id: number;
  title: string;
  type: 'announcement' | 'promotion' | 'article';
  body: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  publish_at: string | null;
  archived_at: string | null;
  view_count: number;
  locale: string;
  created_at: string;
  updated_at: string;
}

const CONTENT_TYPES = ['announcement', 'promotion', 'article'] as const;
const STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;

/** 到点自动发布：scheduled → published（publish_at <= now）；调用时机：每次读 published 时惰性触发 */
export function flushScheduled(): number {
  const info = db
    .prepare(
      `UPDATE contents SET status = 'published', updated_at = datetime('now')
       WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= datetime('now')`,
    )
    .run();
  return Number(info.changes);
}

function authRole(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const header = String(req.headers.authorization ?? '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const row = db
    .prepare('SELECT u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
    .get(token) as { role: string } | undefined;
  return row?.role ?? null;
}

/** POST /api/cms/contents — 创建内容（仅 admin）；body: { title, type, body?, publish_at?, locale? }，带 publish_at 则 scheduled */
cmsRouter.post('/cms/contents', requireAuth, requireRole('admin'), (req, res) => {
  const { title, type, body, publish_at, locale } = req.body ?? {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!CONTENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${CONTENT_TYPES.join(', ')}` });
  }
  const pubAt = publish_at ? String(publish_at) : null;
  if (pubAt && Number.isNaN(Date.parse(pubAt))) {
    return res.status(400).json({ error: 'publish_at 必须是合法时间字符串' });
  }
  const loc = locale && typeof locale === 'string' ? locale.slice(0, 8) : 'zh';
  const status = pubAt ? 'scheduled' : 'draft';
  const stmt = db.prepare(
    `INSERT INTO contents (title, type, body, status, publish_at, locale) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const info = stmt.run(title.trim(), type, body ?? '', status, pubAt, loc);
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(info.lastInsertRowid) as ContentRow;
  res.status(201).json({ content: row });
});

/** GET /api/cms/contents?status=published|draft|scheduled|archived&locale=zh — 列表
 *  published 公开（先惰性触发定时发布）；locale 过滤可选；
 *  draft/scheduled/archived/全部 仅 admin */
cmsRouter.get('/cms/contents', (req, res) => {
  const { status, locale } = req.query;
  const role = authRole(req);
  if (status !== 'published') {
    if (role !== 'admin') {
      return res.status(403).json({ error: '没有权限查看草稿/定时/归档内容' });
    }
  }
  if (status === 'published') flushScheduled();
  const locFilter = typeof locale === 'string' && locale.trim() ? locale.trim().slice(0, 8) : null;
  const rows = db
    .prepare(
      locFilter
        ? 'SELECT * FROM contents WHERE locale = ? ORDER BY updated_at DESC'
        : 'SELECT * FROM contents ORDER BY updated_at DESC',
    )
    .all(...(locFilter ? [locFilter] : [])) as ContentRow[];
  if (typeof status === 'string' && (STATUSES as readonly string[]).includes(status)) {
    const filtered = rows.filter((r) => r.status === status);
    return res.json({ count: filtered.length, contents: filtered });
  }
  res.json({ count: rows.length, contents: rows });
});

/** GET /api/cms/contents/:id — 单条内容（published 公开，阅读自增 view_count；draft/scheduled/archived 仅 admin） */
cmsRouter.get('/cms/contents/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(Number(req.params.id)) as ContentRow | undefined;
  if (!row) return res.status(404).json({ error: 'content not found' });
  if (row.status !== 'published') {
    if (authRole(req) !== 'admin') return res.status(403).json({ error: '内容未发布，仅 admin 可见' });
  } else {
    db.prepare('UPDATE contents SET view_count = view_count + 1 WHERE id = ?').run(row.id);
    row.view_count += 1;
  }
  res.json({ content: row });
});

/** PUT /api/cms/contents/:id — 编辑内容（仅 admin）；body 可含 publish_at（设 null 清除定时） */
cmsRouter.put('/cms/contents/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow | undefined;
  if (!existing) return res.status(404).json({ error: 'content not found' });

  const { title, type, body, publish_at, locale } = req.body ?? {};
  const newTitle = title !== undefined ? String(title).trim() : existing.title;
  const newType = type !== undefined ? String(type) : existing.type;
  const newBody = body !== undefined ? String(body) : existing.body;
  const newLocale = locale !== undefined ? String(locale).slice(0, 8) : existing.locale;
  let newStatus = existing.status;
  let newPubAt = existing.publish_at;
  if (publish_at !== undefined) {
    if (publish_at === null) {
      newPubAt = null;
      if (newStatus === 'scheduled') newStatus = 'draft';
    } else {
      const v = String(publish_at);
      if (Number.isNaN(Date.parse(v))) return res.status(400).json({ error: 'publish_at 必须是合法时间字符串' });
      newPubAt = v;
      if (newStatus === 'draft' || newStatus === 'scheduled') newStatus = 'scheduled';
    }
  }

  if (!newTitle) return res.status(400).json({ error: 'title cannot be empty' });
  if (!CONTENT_TYPES.includes(newType as (typeof CONTENT_TYPES)[number])) {
    return res.status(400).json({ error: `type must be one of: ${CONTENT_TYPES.join(', ')}` });
  }

  db.prepare(
    `UPDATE contents SET title = ?, type = ?, body = ?, status = ?, publish_at = ?, locale = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(newTitle, newType, newBody, newStatus, newPubAt, newLocale, id);
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow;
  res.json({ content: row });
});

/** POST /api/cms/contents/:id/publish — 立即发布（仅 admin；draft/scheduled → published） */
cmsRouter.post('/cms/contents/:id/publish', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow | undefined;
  if (!existing) return res.status(404).json({ error: 'content not found' });
  if (existing.status === 'archived') {
    return res.status(409).json({ error: '已归档内容不可发布，请先恢复' });
  }
  db.prepare(`UPDATE contents SET status = 'published', publish_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow;
  res.json({ content: row });
});

/** POST /api/cms/contents/:id/unpublish — 下架（仅 admin；published → draft） */
cmsRouter.post('/cms/contents/:id/unpublish', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow | undefined;
  if (!existing) return res.status(404).json({ error: 'content not found' });
  if (existing.status !== 'published') {
    return res.status(409).json({ error: `只有 published 内容可以下架（当前 ${existing.status}）` });
  }
  db.prepare(`UPDATE contents SET status = 'draft', publish_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow;
  res.json({ content: row });
});

/** POST /api/cms/contents/:id/archive — 归档（仅 admin；published/scheduled/draft → archived） */
cmsRouter.post('/cms/contents/:id/archive', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow | undefined;
  if (!existing) return res.status(404).json({ error: 'content not found' });
  if (existing.status === 'archived') {
    return res.status(409).json({ error: '内容已是归档状态' });
  }
  db.prepare(
    `UPDATE contents SET status = 'archived', publish_at = NULL, archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
  ).run(id);
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow;
  res.json({ content: row });
});

/** POST /api/cms/contents/:id/restore — 恢复归档（仅 admin；archived → draft） */
cmsRouter.post('/cms/contents/:id/restore', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow | undefined;
  if (!existing) return res.status(404).json({ error: 'content not found' });
  if (existing.status !== 'archived') {
    return res.status(409).json({ error: `只有 archived 内容可以恢复（当前 ${existing.status}）` });
  }
  db.prepare(
    `UPDATE contents SET status = 'draft', archived_at = NULL, updated_at = datetime('now') WHERE id = ?`,
  ).run(id);
  const row = db.prepare('SELECT * FROM contents WHERE id = ?').get(id) as ContentRow;
  res.json({ content: row });
});