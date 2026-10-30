#!/usr/bin/env node
// 一次性回填：给奥斯陆极光 demo 赛补齐 5 条附加玩法线（>4 触发「查看全部」）
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const db = new Database(process.argv[2] ?? 'data/betting.db');
db.pragma('journal_mode = WAL');

const TARGET = [
  { type: 'ou', line: 1.5, over: 1.5, under: 2.5 },
  { type: 'ou', line: 2.5, over: 2.05, under: 1.75 },
  { type: 'ou', line: 3.5, over: 2.9, under: 1.4 },
  { type: 'ah', line: 0.5, over: 1.72, under: 2.18 },
  { type: 'ah', line: 1, over: 2.1, under: 1.74 },
];
const matches = db
  .prepare("SELECT id FROM matches WHERE status='scheduled' AND external_id LIKE 'lobby-demo:%' AND home_team='奥斯陆极光'")
  .all();
const insM = db.prepare('INSERT INTO markets (match_id, type, line, status) VALUES (?, ?, ?, ?)');
const insO = db.prepare('INSERT INTO odds (market_id, selection, price) VALUES (?, ?, ?)');
const has = db.prepare('SELECT COUNT(*) AS c FROM markets WHERE match_id = ? AND type = ? AND line = ?');
let added = 0;
for (const m of matches) {
  for (const t of TARGET) {
    if (has.get(m.id, t.type, t.line).c === 0) {
      const mk = insM.run(m.id, t.type, t.line, 'open');
      const sels = t.type === 'ou' ? ['over', 'under'] : ['home', 'away'];
      insO.run(Number(mk.lastInsertRowid), sels[0], t.over);
      insO.run(Number(mk.lastInsertRowid), sels[1], t.under);
      added += 1;
    }
  }
}
console.log(`backfill 完成：+${added} 个盘口（${matches.length} 场奥斯陆极光）`);
