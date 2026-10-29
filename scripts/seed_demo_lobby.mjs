#!/usr/bin/env node
// scripts/seed_demo_lobby.mjs — 玩家端大厅演示数据种子（幂等）
//
// 背景：此前 scripts/verify_*_ux.mjs 直接往库里塞 `KUXHome<时间戳>` 这类验证用赛事且不清理，
// 大厅里全是「K2Home1787662322 vs K2Away1787662322 · 1/1 20:00」的脏数据。
// 本脚本提供一套可反复执行的正常演示赛程：虚构队名、开赛时间散布在未来 1~6 天、
// 每场赔率各不相同，并包含一场挂盘市场让「仅开盘」筛选可感知。
//
// 用法：node scripts/seed_demo_lobby.mjs [--db <path>]（默认 repo/data/betting.db）

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const argDbIdx = process.argv.indexOf('--db');
const DB_FILE =
  argDbIdx !== -1 ? process.argv[argDbIdx + 1] : new URL('../data/betting.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

if (!existsSync(DB_FILE)) {
  console.error(`❌ 数据库不存在: ${DB_FILE}`);
  process.exit(1);
}

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

const MARKER = 'lobby-demo';
const hour = 36e5;
const now = Date.now();

/** 演示赛程：队名全部虚构，kickoff 为相对当前的小时偏移 */
const DEMO = [
  { sport: 'soccer', league: '东亚超级联赛', home: '海东蓝鲨', away: '临港飞鹰', inH: 5, odds: [2.05, 3.25, 3.5] },
  { sport: 'soccer', league: '东亚超级联赛', home: '青云 FC', away: '白山联', inH: 28, odds: [1.85, 3.6, 4.0] },
  { sport: 'soccer', league: '北欧联杯', home: '奥斯陆极光', away: '哥德堡水手', inH: 52, odds: [2.6, 3.2, 2.75] },
  { sport: 'basketball', league: '太平洋职业联赛', home: '湾城巨鲸', away: '沙丘烈焰', inH: 9, odds: [1.72, null, 2.15] },
  { sport: 'basketball', league: '太平洋职业联赛', home: '高原雄鹰', away: '港都猛虎', inH: 33, odds: [2.1, null, 1.78] },
  { sport: 'tennis', league: 'ATP 巡回赛', home: '林德罗夫', away: '卡斯蒂亚', inH: 14, odds: [1.95, null, 1.88] },
  { sport: 'baseball', league: '远东棒球联盟', home: '首尔多克丝', away: '釜山巨浪', inH: 20, odds: [2.3, null, 1.65] },
  { sport: 'icehockey', league: '北方冰球联', home: '雪城狼群', away: '极地海豹', inH: 41, odds: [2.15, 3.9, 2.95] },
  { sport: 'americanfootball', league: '大陆橄榄球联', home: '钢铁锻造者', away: '河谷公牛', inH: 62, odds: [1.68, null, 2.25] },
  { sport: 'esports', league: '全球电竞冠军杯', home: '银月战队', away: '曙光战队', inH: 11, odds: [1.55, null, 2.5] },
  // 挂盘演示：市场 suspended，「仅开盘」筛选前后列表有可见差异
  { sport: 'soccer', league: '北欧联杯', home: '卑尔根霜', away: '马尔默狮子', inH: 77, odds: [2.45, 3.3, 2.9], suspend: true },
  { sport: 'tennis', league: 'WTA 巡回赛', home: '早乙女凛', away: '杜兰朵', inH: 96, odds: [2.4, null, 1.6] },
];

const insertMatch = db.prepare(
  `INSERT INTO matches (home_team, away_team, kickoff_time, status, external_id, source, sport, league)
   VALUES (?, ?, ?, 'scheduled', ?, 'manual', ?, ?)`,
);
const insertMarket = db.prepare('INSERT INTO markets (match_id, type, line, status) VALUES (?, ?, ?, ?)');
const insertOdds = db.prepare('INSERT INTO odds (market_id, selection, price) VALUES (?, ?, ?)');

const seed = db.transaction(() => {
  let created = 0;
  // 幂等键带日期：跨天重跑会生成新一"代"赛程（旧一代随开赛自然滚出窗口）
  const gen = new Date().toISOString().slice(0, 10);
  for (const m of DEMO) {
    // 幂等：external_id 唯一标记
    const exists = db.prepare('SELECT id FROM matches WHERE external_id = ?').get(`${MARKER}:${gen}:${m.league}:${m.home}`);
    if (exists) continue;
    const kickoff = new Date(now + m.inH * hour);
    // 对齐到整点分钟，观感更自然
    kickoff.setMinutes(0, 0, 0);
    const info = insertMatch.run(m.home, m.away, kickoff.toISOString(), `${MARKER}:${gen}:${m.league}:${m.home}`, m.sport, m.league);
    const matchId = Number(info.lastInsertRowid);
    if (m.sport === 'soccer' || m.sport === 'icehockey') {
      const mk = insertMarket.run(matchId, '1x2', null, m.suspend ? 'suspended' : 'open');
      const [h, d, a] = m.odds;
      insertOdds.run(Number(mk.lastInsertRowid), 'home', h);
      insertOdds.run(Number(mk.lastInsertRowid), 'draw', d);
      insertOdds.run(Number(mk.lastInsertRowid), 'away', a);
    } else {
      const mk = insertMarket.run(matchId, '1x2', null, m.suspend ? 'suspended' : 'open');
      insertOdds.run(Number(mk.lastInsertRowid), 'home', m.odds[0]);
      insertOdds.run(Number(mk.lastInsertRowid), 'away', m.odds[2]);
    }
    created += 1;
  }
  return created;
});

const n = seed();
const total = db.prepare("SELECT COUNT(*) n FROM matches WHERE status='scheduled'").get().n;
console.log(`✅ demo lobby seed 完成：新增 ${n} 场，当前 scheduled 共 ${total} 场 (${DB_FILE})`);

// 附带检查：提醒遗留验证数据（本脚本不自动删，清理由 ops 决定）
const leftover = db
  .prepare("SELECT COUNT(*) n FROM matches WHERE kickoff_time = '2099-01-01T12:00:00.000Z'")
  .get().n;
if (leftover > 0) {
  console.log(`⚠️ 仍检测到 ${leftover} 场 kickoff=2099-01-01 的验证遗留赛事，可用 ops 清理脚本删除`);
}
