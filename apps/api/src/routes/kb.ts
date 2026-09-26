// kb.ts (R6 客服知识库) — FAQ 分类 + 文章 CRUD + 公开搜索。
//
// 设计原则：
//   1. 公开端点：GET /kb/categories + GET /kb/articles（status='published'）— 任何用户都能搜
//   2. admin 端点：/admin/kb/* — create / update / delete / publish / 投票反馈
//   3. 搜索：LIKE '%q%' 模糊匹配 title + body + tags（按 view_count DESC 排序，避免冷门噪声）
//   4. 自动计数：GET /kb/articles/:id 自增 view_count；POST /kb/articles/:id/helpful 投 helpful_yes/no
//   5. slug 唯一：URL 友好，便于分享深链（e.g. /kb/how-to-deposit）
//   6. 限额：未来加 rate limit（与 R7 类似；MVP 先不做，知识库读流量可控）
//
// 用法：
//   import { kbRouter, adminKbRouter } from './routes/kb.js';
//   app.use('/api', kbRouter);
//   app.use('/api', adminKbRouter);

import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';

export const kbRouter = Router();
export const adminKbRouter = Router();

interface CategoryRow { id: number; slug: string; title: string; sort_order: number; icon: string }
interface ArticleRow {
  id: number; category_id: number; slug: string; title: string; body: string;
  tags: string; status: 'draft' | 'published' | 'archived';
  view_count: number; helpful_yes: number; helpful_no: number;
  created_at: string; updated_at: string;
}

// ─── 公开：分类列表（按 sort_order ASC） ───
kbRouter.get('/kb/categories', (_req, res) => {
  const rows = db.prepare(
    `SELECT c.id, c.slug, c.title, c.icon, c.sort_order, COUNT(a.id) AS article_count
     FROM kb_categories c
     LEFT JOIN kb_articles a ON a.category_id = c.id AND a.status = 'published'
     GROUP BY c.id ORDER BY c.sort_order ASC, c.id ASC`
  ).all() as Array<CategoryRow & { article_count: number }>;
  res.json({ categories: rows });
});

// ─── 公开：文章搜索 / 列表（status='published'） ───
kbRouter.get('/kb/articles', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const categorySlug = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
  let sql = `SELECT a.id, a.category_id, a.slug, a.title, a.status, a.tags, a.view_count, a.helpful_yes, a.helpful_no,
                    a.created_at, a.updated_at, c.slug AS category_slug, c.title AS category_title
             FROM kb_articles a JOIN kb_categories c ON c.id = a.category_id
             WHERE a.status = 'published'`;
  const params: (string | number)[] = [];
  if (categorySlug) { sql += ` AND c.slug = ?`; params.push(categorySlug); }
  if (q) { sql += ` AND (a.title LIKE ? OR a.body LIKE ? OR a.tags LIKE ?)`;
    const like = `%${q}%`; params.push(like, like, like); }
  sql += ` ORDER BY a.view_count DESC, a.updated_at DESC LIMIT ?`;
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  res.json({ articles: rows });
});

// ─── 公开：单篇文章详情（slug 或 id）+ 自增 view_count ───
kbRouter.get('/kb/articles/:slugOrId', (req, res) => {
  const key = req.params.slugOrId;
  const isId = /^\d+$/.test(key);
  const row = db.prepare(
    isId
      ? `SELECT * FROM kb_articles WHERE id = ? AND status = 'published'`
      : `SELECT * FROM kb_articles WHERE slug = ? AND status = 'published'`
  ).get(key) as ArticleRow | undefined;
  if (!row) return res.status(404).json({ error: '文章不存在或未发布' });
  // 自增 view_count（异步也不需要 fire-and-forget）
  db.prepare('UPDATE kb_articles SET view_count = view_count + 1 WHERE id = ?').run(row.id);
  const cat = db.prepare('SELECT slug, title, icon FROM kb_categories WHERE id = ?').get(row.category_id);
  res.json({ article: row, category: cat });
});

// ─── 公开：「有帮助」投票 ───
kbRouter.post('/kb/articles/:id/helpful', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid article id' });
  const v = req.body?.vote;
  if (v !== 'yes' && v !== 'no') return res.status(400).json({ error: 'vote must be "yes" or "no"' });
  const col = v === 'yes' ? 'helpful_yes' : 'helpful_no';
  const row = db.prepare(`UPDATE kb_articles SET ${col} = ${col} + 1 WHERE id = ? AND status='published'`).run(id);
  if (row.changes === 0) return res.status(404).json({ error: '文章不存在或未发布' });
  const after = db.prepare('SELECT helpful_yes, helpful_no FROM kb_articles WHERE id = ?').get(id) as { helpful_yes: number; helpful_no: number };
  res.json({ ok: true, ...after });
});

// ─── admin：分类 CRUD ───
adminKbRouter.get('/admin/kb/categories', requireAuth, requireRole('admin'), (_req, res) => {
  const rows = db.prepare(
    `SELECT c.*, COUNT(a.id) AS article_count
     FROM kb_categories c LEFT JOIN kb_articles a ON a.category_id = c.id
     GROUP BY c.id ORDER BY c.sort_order ASC, c.id ASC`
  ).all();
  res.json({ categories: rows });
});

adminKbRouter.post('/admin/kb/categories', requireAuth, requireRole('admin'), (req, res) => {
  const { slug, title, icon = '', sort_order = 0 } = req.body ?? {};
  if (typeof slug !== 'string' || !slug.trim()) return res.status(400).json({ error: 'slug required' });
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' });
  try {
    const r = db.prepare('INSERT INTO kb_categories (slug, title, icon, sort_order) VALUES (?, ?, ?, ?)').run(slug.trim(), title.trim(), icon, sort_order);
    res.status(201).json({ id: r.lastInsertRowid, slug, title, icon, sort_order });
  } catch (e) {
    res.status(409).json({ error: `slug 已存在：${(e as Error).message}` });
  }
});

adminKbRouter.put('/admin/kb/categories/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const { title, icon, sort_order } = req.body ?? {};
  const existing = db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(id) as CategoryRow | undefined;
  if (!existing) return res.status(404).json({ error: '分类不存在' });
  db.prepare('UPDATE kb_categories SET title = ?, icon = ?, sort_order = ? WHERE id = ?').run(
    title ?? existing.title, icon ?? existing.icon, sort_order ?? existing.sort_order, id
  );
  res.json({ ...existing, title: title ?? existing.title, icon: icon ?? existing.icon, sort_order: sort_order ?? existing.sort_order });
});

adminKbRouter.delete('/admin/kb/categories/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM kb_categories WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: '分类不存在' });
  res.json({ ok: true });
});

// ─── admin：文章 CRUD ───
adminKbRouter.get('/admin/kb/articles', requireAuth, requireRole('admin'), (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  let sql = `SELECT a.*, c.slug AS category_slug, c.title AS category_title
             FROM kb_articles a JOIN kb_categories c ON c.id = a.category_id`;
  const params: string[] = [];
  if (['draft', 'published', 'archived'].includes(status)) { sql += ` WHERE a.status = ?`; params.push(status); }
  sql += ` ORDER BY a.updated_at DESC`;
  const rows = db.prepare(sql).all(...params);
  res.json({ articles: rows });
});

adminKbRouter.post('/admin/kb/articles', requireAuth, requireRole('admin'), (req, res) => {
  const { category_id, slug, title, body, tags = '', status = 'draft' } = req.body ?? {};
  const me = res.locals.user as { id: number };
  if (!Number.isInteger(category_id)) return res.status(400).json({ error: 'category_id (integer) required' });
  if (typeof slug !== 'string' || !slug.trim()) return res.status(400).json({ error: 'slug required' });
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title required' });
  if (typeof body !== 'string') return res.status(400).json({ error: 'body required' });
  if (!['draft', 'published', 'archived'].includes(status)) return res.status(400).json({ error: 'status invalid' });
  const catExists = db.prepare('SELECT id FROM kb_categories WHERE id = ?').get(category_id);
  if (!catExists) return res.status(400).json({ error: 'category_id 不存在' });
  try {
    const r = db.prepare(
      `INSERT INTO kb_articles (category_id, slug, title, body, tags, status, author_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(category_id, slug.trim(), title.trim(), body, tags, status, me.id);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: `slug 已存在：${(e as Error).message}` });
  }
});

adminKbRouter.put('/admin/kb/articles/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM kb_articles WHERE id = ?').get(id) as ArticleRow | undefined;
  if (!existing) return res.status(404).json({ error: '文章不存在' });
  const { category_id, slug, title, body, tags, status } = req.body ?? {};
  const next = {
    category_id: category_id ?? existing.category_id,
    slug: typeof slug === 'string' ? slug.trim() : existing.slug,
    title: typeof title === 'string' ? title.trim() : existing.title,
    body: typeof body === 'string' ? body : existing.body,
    tags: typeof tags === 'string' ? tags : existing.tags,
    status: status ?? existing.status,
  };
  if (!['draft', 'published', 'archived'].includes(next.status)) return res.status(400).json({ error: 'status invalid' });
  db.prepare(
    `UPDATE kb_articles SET category_id = ?, slug = ?, title = ?, body = ?, tags = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(next.category_id, next.slug, next.title, next.body, next.tags, next.status, id);
  res.json({ ok: true, id });
});

adminKbRouter.delete('/admin/kb/articles/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM kb_articles WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: '文章不存在' });
  res.json({ ok: true });
});

// ─── admin：重置视图计数（运维/测试用） ───
adminKbRouter.post('/admin/kb/articles/:id/reset-views', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE kb_articles SET view_count = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});