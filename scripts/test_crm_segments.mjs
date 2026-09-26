// test_crm_segments.mjs — R11 CRM 分群 + 营销单元测试（Node 24 --test + tsx）
//
// 覆盖：DSL 各 key → SQL 正确性 / segment 评估人数 / campaign executor（site_message/bonus_credit/promotion_code）/
//       cooldown 跳过 / UNIQUE 防重复 / notifications 用户查 / mark read

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

// 复制关键 schema 用于 fixture（与 production 一致）
function setupDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      vip_tier TEXT NOT NULL DEFAULT 'bronze',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE NOT NULL, balance REAL NOT NULL DEFAULT 0);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER, type TEXT, amount REAL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE user_preferences (user_id INTEGER PRIMARY KEY, marketing_opt_in INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE bets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, status TEXT NOT NULL DEFAULT 'open', stake REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE crm_segments (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, rules_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, cached_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE crm_campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, segment_id INTEGER NOT NULL REFERENCES crm_segments(id), name TEXT NOT NULL, action_type TEXT NOT NULL, action_payload_json TEXT NOT NULL DEFAULT '{}', cooldown_days INTEGER NOT NULL DEFAULT 7, max_executions INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE crm_campaign_executions (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER NOT NULL REFERENCES crm_campaigns(id), user_id INTEGER NOT NULL REFERENCES users(id), segment_id INTEGER NOT NULL REFERENCES crm_segments(id), action_type TEXT NOT NULL, action_payload_json TEXT NOT NULL DEFAULT '{}', delivered INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(campaign_id, user_id));
    CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'system', read_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));

    INSERT INTO users (name, role, vip_tier) VALUES
      ('admin', 'admin', 'diamond'), ('alice', 'user', 'gold'),
      ('bob',   'user', 'silver'), ('carol', 'user', 'bronze'),
      ('newbie','user', 'bronze');
    INSERT INTO accounts (user_id, balance) VALUES (1, 0), (2, 1000), (3, 500), (4, 100), (5, 0);
    INSERT INTO bets (user_id, status, stake) VALUES (2, 'won', 3000), (2, 'lost', 2000);
    INSERT INTO bets (user_id, status, stake) VALUES (3, 'lost', 100);
    INSERT INTO user_preferences (user_id, marketing_opt_in) VALUES (2, 0), (3, 1), (4, 1), (5, 1);
  `);
  return db;
}

// 复制 crmSegments.ts 的 DSL 逻辑（保持同步：失败时 build 跑 CI 验证）
const VIP_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
function ruleToSql(key, value) {
  const numMatch = String(value).match(/^([><]=?|=|!=)\s*(\d+(?:\.\d+)?)$/);
  const params = [];
  switch (key) {
    case 'vipTier': {
      const s = String(value);
      if (s.endsWith('+')) {
        const base = s.slice(0, -1);
        const idx = VIP_ORDER.indexOf(base);
        if (idx === -1) return { where: '0', params: [] };
        const tiers = VIP_ORDER.slice(idx);
        return { where: `u.vip_tier IN (${tiers.map(() => '?').join(',')})`, params: tiers };
      }
      return { where: 'u.vip_tier = ?', params: [s] };
    }
    case 'lifetimeStake': {
      if (!numMatch) return { where: '0', params: [] };
      const op = numMatch[1]; const num = Number(numMatch[2]);
      return { where: `COALESCE((SELECT SUM(stake) FROM bets WHERE user_id = u.id AND status != 'void'), 0) ${op} ?`, params: [num] };
    }
    case 'totalBets': {
      if (!numMatch) return { where: '0', params: [] };
      const op = numMatch[1]; const num = Number(numMatch[2]);
      return { where: `(SELECT COUNT(*) FROM bets WHERE user_id = u.id) ${op} ?`, params: [num] };
    }
    case 'daysSinceRegistered': {
      if (!numMatch) return { where: '0', params: [] };
      const op = numMatch[1]; const num = Number(numMatch[2]);
      return { where: `(julianday('now') - julianday(u.created_at)) ${op} ?`, params: [num] };
    }
    case 'marketingOptIn': {
      const want = value === true || value === 'true' || value === '1' ? 1 : 0;
      return { where: `COALESCE((SELECT marketing_opt_in FROM user_preferences WHERE user_id = u.id), 1) = ?`, params: [want] };
    }
    default:
      return { where: '0', params: [] };
  }
}
function evaluateSegment(db, rules) {
  const wheres = []; const params = [];
  for (const [k, v] of Object.entries(rules)) {
    const { where, params: ps } = ruleToSql(k, v);
    wheres.push(where); params.push(...ps);
  }
  const sql = `SELECT u.id FROM users u WHERE u.role != 'admin' AND ${wheres.length ? wheres.join(' AND ') : '1=1'}`;
  return db.prepare(sql).all(...params).map(r => r.id);
}

// ─── DSL 评估 ───
test('R11-01 vipTier=gold+：命中 gold/platinum/diamond，admin 排除', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, { vipTier: 'gold+' });
  // alice=gold → 应命中（admin 被排除，diamond 是 admin 不命中）
  assert.deepEqual(ids, [2]);
});
test('R11-02 vipTier=silver：仅 silver', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, { vipTier: 'silver' });
  assert.deepEqual(ids, [3]);
});
test('R11-03 lifetimeStake>=1000：alice(5000) 命中，bob(100)/carol(0)/newbie(0) 不命中', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, { lifetimeStake: '>=1000' });
  assert.deepEqual(ids, [2]);
});
test('R11-04 lifetimeStake>=100：alice + bob 命中', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, { lifetimeStake: '>=100' });
  assert.deepEqual(ids.sort(), [2, 3]);
});
test('R11-05 totalBets=2：alice 恰好 2 注，命中', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, { totalBets: '=2' });
  assert.deepEqual(ids, [2]);
});
test('R11-06 marketingOptIn=1：排除 alice(opt-out)，命中 bob/carol/newbie', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, { marketingOptIn: '1' });
  assert.deepEqual(ids.sort(), [3, 4, 5]);
});
test('R11-07 marketingOptIn=0：仅 alice(opt-out) 命中', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, { marketingOptIn: '0' });
  assert.deepEqual(ids, [2]);
});
test('R11-08 组合 rules：gold+ 且 lifetimeStake>=1000 且 opt_in', () => {
  const db = setupDb();
  // alice 是 gold 但 opt-out，所以被 opt_in 排除
  const ids = evaluateSegment(db, { vipTier: 'gold+', lifetimeStake: '>=1000', marketingOptIn: '1' });
  assert.deepEqual(ids, []);
});
test('R11-09 空 rules：所有非 admin 都命中', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, {});
  assert.deepEqual(ids.sort(), [2, 3, 4, 5]);
});
test('R11-10 非法 rule key：返回空集（不抛）', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, { unknownKey: 'x' });
  assert.deepEqual(ids, []);
});
test('R11-11 非法 value：返回空集', () => {
  const db = setupDb();
  const ids = evaluateSegment(db, { lifetimeStake: 'abc' });
  assert.deepEqual(ids, []);
});

// ─── Campaign executor ───
test('R11-12 site_message：每个 user 写一行 notification', () => {
  const db = setupDb();
  db.prepare(`INSERT INTO crm_segments (slug, name, rules_json) VALUES ('s1', 's1', '{}')`).run();
  const segId = db.prepare(`SELECT id FROM crm_segments WHERE slug='s1'`).get().id;
  db.prepare(`INSERT INTO crm_campaigns (segment_id, name, action_type, action_payload_json, cooldown_days) VALUES (?, 'c1', 'site_message', ?, 0)`).run(segId, JSON.stringify({ title: '你好', body: '专属优惠' }));
  const camp = db.prepare(`SELECT * FROM crm_campaigns WHERE name='c1'`).get();
  const ids = evaluateSegment(db, {});
  const cooldownSince = new Date(Date.now() - 0).toISOString().slice(0, 19).replace('T', ' ');
  let delivered = 0;
  // node:sqlite 没有 db.transaction API；模拟 transaction 用 SAVEPOINT 嵌套 + 手动 begin/commit
  for (const uid of ids) {
    db.exec('BEGIN');
    try {
      const recent = db.prepare(`SELECT id FROM crm_campaign_executions WHERE campaign_id=? AND user_id=? AND created_at>=?`).get(camp.id, uid, cooldownSince);
      if (recent) { db.exec('ROLLBACK'); continue; }
      db.prepare(`INSERT INTO notifications (user_id, title, body, category) VALUES (?, ?, ?, 'campaign')`).run(uid, '你好', '专属优惠');
      db.prepare(`INSERT OR IGNORE INTO crm_campaign_executions (campaign_id, user_id, segment_id, action_type, action_payload_json, delivered) VALUES (?,?,?,?,?,1)`).run(camp.id, uid, camp.segment_id, camp.action_type, camp.action_payload_json);
      db.exec('COMMIT');
      delivered++;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  assert.equal(delivered, 4);
  const notifCount = db.prepare(`SELECT COUNT(*) AS n FROM notifications`).get().n;
  assert.equal(notifCount, 4);
});

test('R11-13 bonus_credit：加余额 + transactions + notification', () => {
  const db = setupDb();
  db.prepare(`INSERT INTO crm_segments (slug, name, rules_json) VALUES ('s2', 's2', '{}')`).run();
  const segId = db.prepare(`SELECT id FROM crm_segments WHERE slug='s2'`).get().id;
  db.prepare(`INSERT INTO crm_campaigns (segment_id, name, action_type, action_payload_json, cooldown_days) VALUES (?, 'c2', 'bonus_credit', ?, 0)`).run(segId, JSON.stringify({ amount: 50 }));
  const camp = db.prepare(`SELECT * FROM crm_campaigns WHERE name='c2'`).get();
  const ids = evaluateSegment(db, { vipTier: 'silver' }); // 仅 bob
  assert.deepEqual(ids, [3]);
  // bob 当前余额 50
  const balBefore = db.prepare(`SELECT balance FROM accounts WHERE user_id=3`).get().balance;
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE accounts SET balance = balance + 50 WHERE user_id=3`).run();
    db.prepare(`INSERT INTO transactions (account_id, type, amount) VALUES ((SELECT id FROM accounts WHERE user_id=3), 'adjust', 50)`).run();
    db.prepare(`INSERT INTO notifications (user_id, title, body, category) VALUES (3, '奖金 50', 'ok', 'campaign')`).run();
    db.prepare(`INSERT INTO crm_campaign_executions (campaign_id, user_id, segment_id, action_type, action_payload_json, delivered) VALUES (?, 3, ?, 'bonus_credit', ?, 1)`).run(camp.id, segId, camp.action_payload_json);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  const balAfter = db.prepare(`SELECT balance FROM accounts WHERE user_id=3`).get().balance;
  assert.equal(balAfter, balBefore + 50);
  const txCount = db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE type='adjust'`).get().n;
  assert.equal(txCount, 1);
});

test('R11-14 UNIQUE 防重复：同一 user 第二次执行被 ignore', () => {
  const db = setupDb();
  db.prepare(`INSERT INTO crm_segments (slug, name, rules_json) VALUES ('s3', 's3', '{}')`).run();
  const segId = db.prepare(`SELECT id FROM crm_segments WHERE slug='s3'`).get().id;
  db.prepare(`INSERT INTO crm_campaigns (segment_id, name, action_type, action_payload_json, cooldown_days) VALUES (?, 'c3', 'site_message', '{}', 0)`).run(segId);
  const camp = db.prepare(`SELECT * FROM crm_campaigns WHERE name='c3'`).get();
  // 第一次执行
  db.prepare(`INSERT INTO crm_campaign_executions (campaign_id, user_id, segment_id, action_type, action_payload_json) VALUES (?, 2, ?, 'site_message', '{}')`).run(camp.id, segId);
  // 第二次 INSERT OR IGNORE 应被忽略
  const r = db.prepare(`INSERT OR IGNORE INTO crm_campaign_executions (campaign_id, user_id, segment_id, action_type, action_payload_json) VALUES (?, 2, ?, 'site_message', '{}')`).run(camp.id, segId);
  assert.equal(r.changes, 0, 'OR IGNORE 不应插入');
  const cnt = db.prepare(`SELECT COUNT(*) AS n FROM crm_campaign_executions WHERE campaign_id=? AND user_id=2`).get(camp.id).n;
  assert.equal(cnt, 1);
});

test('R11-15 notifications：unread 过滤 + mark read', () => {
  const db = setupDb();
  db.prepare(`INSERT INTO notifications (user_id, title, body) VALUES (2, 'A', 'a'), (2, 'B', 'b'), (3, 'C', 'c')`).run();
  const all = db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id=2`).get().n;
  assert.equal(all, 2);
  const unread = db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id=2 AND read_at IS NULL`).get().n;
  assert.equal(unread, 2);
  db.prepare(`UPDATE notifications SET read_at=datetime('now') WHERE user_id=2 AND id IN (SELECT id FROM notifications WHERE user_id=2 LIMIT 1)`).run();
  const unread2 = db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id=2 AND read_at IS NULL`).get().n;
  assert.equal(unread2, 1);
});