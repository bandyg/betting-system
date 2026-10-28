#!/usr/bin/env node
// scripts/cleanup_verify_artifacts.mjs — 清理 verify_* 脚本遗留在库里的验证数据
//
// 背景：verify_k_ux / verify_l_ux / verify_m_ux / verify_analytics* / verify_rate_limit
// 等脚本会 POST /matches 建验证赛事（统一 kickoff=2099-01-01T12:00:00.000Z、source=manual），
// 历次运行从未清理，玩家端大厅长期显示「KUXHome1787662322 vs KUXAway1787662322」这类脏数据。
// 本脚本按依赖序删除这些赛事及其市场/赔率/注单/流水，可同时按 id 清理测试用户。
//
// 用法：
//   node scripts/cleanup_verify_artifacts.mjs            # dry-run：只打印将被删除的对象
//   node scripts/cleanup_verify_artifacts.mjs --apply    # 实际执行
//   node scripts/cleanup_verify_artifacts.mjs --apply --user-ids 96   # 连带清理指定测试用户
//
// 运行前请确认服务已停或接受 WAL 并发写；脚本自身会先做一份 .bak 备份。

import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const userIdx = process.argv.indexOf('--user-ids');
const USER_IDS = userIdx !== -1 ? process.argv[userIdx + 1].split(',').map(Number).filter(Number.isInteger) : [];
const DB_FILE = new URL('../data/betting.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

const VERIFY_KICKOFF = '2099-01-01T12:00:00.000Z';
const matchIds = db
  .prepare("SELECT id FROM matches WHERE kickoff_time = ? AND source = 'manual'")
  .all(VERIFY_KICKOFF)
  .map((r) => r.id);

console.log(`DB: ${DB_FILE}`);
console.log(`验证遗留赛事: ${matchIds.length} 场${matchIds.length ? '（id: ' + matchIds.join(',') + '）' : ''}`);
if (USER_IDS.length) console.log(`指定清理用户: ${USER_IDS.join(',')}`);

const stats = {};
function count(sql, ...params) {
  return db.prepare(sql).get(...params).n;
}
if (matchIds.length) {
  stats.markets = count(`SELECT COUNT(*) n FROM markets WHERE match_id IN (${matchIds.join(',')})`);
  stats.bets = count(
    `SELECT COUNT(*) n FROM bets WHERE market_id IN (SELECT id FROM markets WHERE match_id IN (${matchIds.join(',')})) OR id IN (SELECT bet_id FROM bet_legs WHERE market_id IN (SELECT id FROM markets WHERE match_id IN (${matchIds.join(',')})))`,
  );
}
for (const uid of USER_IDS) {
  const u = db.prepare('SELECT name FROM users WHERE id = ?').get(uid);
  console.log(`  user#${uid}: ${u ? u.name : '不存在'}`);
}

if (!APPLY) {
  console.log('DRY-RUN：加 --apply 实际执行');
  process.exit(0);
}

copyFileSync(DB_FILE, `${DB_FILE}.bak-cleanup-${Date.now()}`);

const run = db.transaction(() => {
  // 1) 验证赛事关联的注单/流水/市场
  if (matchIds.length) {
    const mkList = matchIds.join(',');
    const betIds = db
      .prepare(
        `SELECT DISTINCT id FROM bets WHERE market_id IN (SELECT id FROM markets WHERE match_id IN (${mkList}))
         OR id IN (SELECT bet_id FROM bet_legs WHERE market_id IN (SELECT id FROM markets WHERE match_id IN (${mkList})))`,
      )
      .all()
      .map((r) => r.id);
    if (betIds.length) {
      const bList = betIds.join(',');
      db.prepare(`DELETE FROM bet_legs WHERE bet_id IN (${bList})`).run();
      db.prepare(`DELETE FROM transactions WHERE ref_type = 'bet' AND ref_id IN (${bList})`).run();
      db.prepare(`DELETE FROM bets WHERE id IN (${bList})`).run();
    }
    db.prepare(`DELETE FROM odds WHERE market_id IN (SELECT id FROM markets WHERE match_id IN (${mkList}))`).run();
    db.prepare(`DELETE FROM markets WHERE match_id IN (${mkList})`).run();
    db.prepare(`DELETE FROM matches WHERE id IN (${mkList})`).run();
  }
  // 2) 指定测试用户及其全部资产
  for (const uid of USER_IDS) {
    const acc = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(uid);
    if (acc) {
      db.prepare('DELETE FROM transactions WHERE account_id = ?').run(acc.id);
      db.prepare('DELETE FROM payment_orders WHERE user_id = ?').run(uid);
    }
    db.prepare('DELETE FROM bet_legs WHERE bet_id IN (SELECT id FROM bets WHERE user_id = ?)').run(uid);
    db.prepare('DELETE FROM bets WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM promotion_claims WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM user_preferences WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM withdrawals WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  }
});
run();

const left = db.prepare("SELECT COUNT(*) n FROM matches WHERE kickoff_time = ?").get(VERIFY_KICKOFF).n;
console.log(`✅ 清理完成；剩余 2099 验证赛事: ${left} 场`);
console.log(`✅ 剩余 scheduled: ${db.prepare("SELECT COUNT(*) n FROM matches WHERE status='scheduled'").get().n} 场`);
