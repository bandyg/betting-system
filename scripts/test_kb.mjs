// test_kb.mjs — R6 客服知识库单元测试（Node 24 --test + tsx）
//
// 覆盖：分类 CRUD / 文章 CRUD / 搜索 / helpful 投票 / status 过滤 / slug 唯一

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

// 模拟 kb router 的核心 SQL：直接跑 SQL 验证业务逻辑（路由测试本身需要启 express）
//   kb router 内 SQL 都来自 schema（kb_categories / kb_articles），可直接 node:sqlite 测

function setupDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE kb_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
      icon TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE kb_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES kb_categories(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      view_count INTEGER NOT NULL DEFAULT 0,
      helpful_yes INTEGER NOT NULL DEFAULT 0, helpful_no INTEGER NOT NULL DEFAULT 0,
      author_user_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_kb_articles_category ON kb_articles(category_id);
    CREATE INDEX idx_kb_articles_status ON kb_articles(status);
  `);
  return db;
}

// ─── 分类 ───
test('R6-01 分类 CRUD + 排序 + slug 唯一', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title, sort_order) VALUES (?, ?, ?)').run('deposit', '充值', 1);
  db.prepare('INSERT INTO kb_categories (slug, title, sort_order) VALUES (?, ?, ?)').run('withdraw', '提现', 2);
  let rows = db.prepare('SELECT * FROM kb_categories ORDER BY sort_order ASC').all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].slug, 'deposit');
  // slug 唯一：重复应 UNIQUE 失败
  assert.throws(() => {
    db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '重复');
  });
});

test('R6-02 分类级联删除文章（CASCADE）', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '充值');
  const catId = (db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('deposit')).id;
  db.prepare('INSERT INTO kb_articles (category_id, slug, title, body) VALUES (?, ?, ?, ?)').run(catId, 'a1', 'A1', 'body');
  db.prepare('DELETE FROM kb_categories WHERE id = ?').run(catId);
  const arts = db.prepare('SELECT * FROM kb_articles').all();
  assert.equal(arts.length, 0, 'CASCADE 应删除该分类下所有文章');
});

// ─── 文章 ───
test('R6-03 文章 CRUD + status 过滤', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '充值');
  const catId = (db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('deposit')).id;
  const insArt = db.prepare(
    'INSERT INTO kb_articles (category_id, slug, title, body, status) VALUES (?, ?, ?, ?, ?)'
  );
  insArt.run(catId, 'p1', '已发布1', 'body1', 'published');
  insArt.run(catId, 'p2', '已发布2', 'body2', 'published');
  insArt.run(catId, 'd1', '草稿1', 'body3', 'draft');
  insArt.run(catId, 'a1', '归档1', 'body4', 'archived');

  const published = db.prepare("SELECT * FROM kb_articles WHERE status = 'published'").all();
  assert.equal(published.length, 2);
  const drafts = db.prepare("SELECT * FROM kb_articles WHERE status = 'draft'").all();
  assert.equal(drafts.length, 1);
});

test('R6-04 文章 slug 唯一', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '充值');
  const catId = (db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('deposit')).id;
  db.prepare('INSERT INTO kb_articles (category_id, slug, title, body) VALUES (?, ?, ?, ?)').run(catId, 'how-to', 'How', 'body');
  assert.throws(() => {
    db.prepare('INSERT INTO kb_articles (category_id, slug, title, body) VALUES (?, ?, ?, ?)').run(catId, 'how-to', 'Dup', 'body');
  });
});

// ─── 搜索 ───
test('R6-05 搜索：title LIKE 命中', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '充值');
  const catId = (db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('deposit')).id;
  const ins = db.prepare('INSERT INTO kb_articles (category_id, slug, title, body, tags, status, view_count) VALUES (?, ?, ?, ?, ?, ?, ?)');
  ins.run(catId, 'how-to-deposit', '如何充值？', '银行卡 USDT 支付宝', '充值,支付', 'published', 10);
  ins.run(catId, 'how-to-withdraw', '如何提现？', '银行卡 1-3 天', '提现', 'published', 5);
  ins.run(catId, 'bet-rule', '投注规则', '1x2 让球大小', '投注', 'published', 3);
  const q = '充值';
  const rows = db.prepare(
    `SELECT * FROM kb_articles WHERE status='published' AND (title LIKE ? OR body LIKE ? OR tags LIKE ?)`
  ).all(`%${q}%`, `%${q}%`, `%${q}%`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, 'how-to-deposit');
});

test('R6-06 搜索：按 category slug 过滤', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '充值');
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('bet-rule', '投注');
  const dId = db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('deposit').id;
  const bId = db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('bet-rule').id;
  const ins = db.prepare('INSERT INTO kb_articles (category_id, slug, title, body, status) VALUES (?, ?, ?, ?, ?)');
  ins.run(dId, 'd1', 'D1', 'x', 'published');
  ins.run(bId, 'b1', 'B1', 'y', 'published');
  const rows = db.prepare(
    `SELECT a.* FROM kb_articles a JOIN kb_categories c ON c.id = a.category_id
     WHERE a.status='published' AND c.slug = ?`
  ).all('deposit');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, 'd1');
});

test('R6-07 搜索：view_count DESC 排序', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '充值');
  const catId = (db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('deposit')).id;
  const ins = db.prepare('INSERT INTO kb_articles (category_id, slug, title, body, status, view_count) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run(catId, 'low',  '低', 'b', 'published', 1);
  ins.run(catId, 'high', '高', 'b', 'published', 100);
  ins.run(catId, 'mid',  '中', 'b', 'published', 10);
  const rows = db.prepare(
    `SELECT * FROM kb_articles WHERE status='published' ORDER BY view_count DESC`
  ).all();
  assert.equal(rows[0].slug, 'high');
  assert.equal(rows[2].slug, 'low');
});

// ─── 投票 ───
test('R6-08 helpful 投票：yes/no 自增', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '充值');
  const catId = (db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('deposit')).id;
  db.prepare('INSERT INTO kb_articles (category_id, slug, title, body, status) VALUES (?, ?, ?, ?, ?)').run(catId, 'a', 'A', 'b', 'published');
  const id = (db.prepare('SELECT id FROM kb_articles WHERE slug=?').get('a')).id;
  db.prepare('UPDATE kb_articles SET helpful_yes = helpful_yes + 1 WHERE id = ?').run(id);
  db.prepare('UPDATE kb_articles SET helpful_yes = helpful_yes + 1 WHERE id = ?').run(id);
  db.prepare('UPDATE kb_articles SET helpful_no = helpful_no + 1 WHERE id = ?').run(id);
  const row = db.prepare('SELECT helpful_yes, helpful_no FROM kb_articles WHERE id = ?').get(id);
  assert.equal(row.helpful_yes, 2);
  assert.equal(row.helpful_no, 1);
});

test('R6-09 view_count 自增（GET /kb/articles/:slug）', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '充值');
  const catId = (db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('deposit')).id;
  db.prepare('INSERT INTO kb_articles (category_id, slug, title, body, status) VALUES (?, ?, ?, ?, ?)').run(catId, 'a', 'A', 'b', 'published');
  const id = (db.prepare('SELECT id FROM kb_articles WHERE slug=?').get('a')).id;
  for (let i = 0; i < 3; i++) db.prepare('UPDATE kb_articles SET view_count = view_count + 1 WHERE id = ?').run(id);
  const row = db.prepare('SELECT view_count FROM kb_articles WHERE id = ?').get(id);
  assert.equal(row.view_count, 3);
});

// ─── CHECK 约束 ───
test('R6-10 status CHECK 约束：非法值拒绝', () => {
  const db = setupDb();
  db.prepare('INSERT INTO kb_categories (slug, title) VALUES (?, ?)').run('deposit', '充值');
  const catId = (db.prepare('SELECT id FROM kb_categories WHERE slug=?').get('deposit')).id;
  assert.throws(() => {
    db.prepare('INSERT INTO kb_articles (category_id, slug, title, body, status) VALUES (?, ?, ?, ?, ?)').run(catId, 'a', 'A', 'b', 'invalid_status');
  });
});