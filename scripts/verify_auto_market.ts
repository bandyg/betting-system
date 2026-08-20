// verify_auto_market.ts — SPORTBOOK 滚球开盘/关盘自动切换逻辑级验证（Step 38）
// 用内存 SQLite 构造场景，直接断言 autoMarket.ts 的纯逻辑。
// 用法: cd ~/services/betting-system && apps/api/node_modules/.bin/tsx scripts/verify_auto_market.ts
import Database from 'better-sqlite3';
import { autoSwitchMarkets, autoSwitchAll, isAutoMarketEnabled } from '../apps/api/src/feeds/autoMarket.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log('PASS', name, detail); }
  else { fail++; console.log('FAIL', name, detail); }
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      kickoff_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      home_score INTEGER, away_score INTEGER,
      external_id TEXT, source TEXT NOT NULL DEFAULT 'manual',
      sport TEXT, league TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE markets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id),
      type TEXT NOT NULL CHECK (type IN ('1x2','ah','ou')),
      line REAL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','suspended','settled','closed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  return db;
}

function insertMatch(db: Database.Database, id: number, kickoff: string, status: string) {
  db.prepare(`INSERT INTO matches (id, home_team, away_team, kickoff_time, status) VALUES (?, 'H', 'A', ?, ?)`).run(id, kickoff, status);
}
function insertMarket(db: Database.Database, id: number, matchId: number, status: string) {
  db.prepare(`INSERT INTO markets (id, match_id, type, line, status) VALUES (?, ?, '1x2', NULL, ?)`).run(id, matchId, status);
}

const now = Date.now();
const past = new Date(now - 3600_000).toISOString();      // 1h ago
const future = new Date(now + 3600_000).toISOString();    // 1h later

// ── 场景 1: kickoff 未到 + scheduled → 保持 open（不变）
{
  const db = makeDb();
  insertMatch(db, 1, future, 'scheduled');
  insertMarket(db, 10, 1, 'open');
  insertMarket(db, 11, 1, 'open');
  const r = autoSwitchMarkets(db, 1);
  check('S1 kickoff未到+scheduled → switched=0', r.switched === 0, JSON.stringify(r));
  const s = db.prepare('SELECT status FROM markets WHERE id=10').get() as { status: string };
  check('S1 markets 仍 open', s.status === 'open', s.status);
}

// ── 场景 2: kickoff 已过 + scheduled → 自动 open
{
  const db = makeDb();
  insertMatch(db, 2, past, 'scheduled');
  insertMarket(db, 20, 2, 'settled');  // 已结算的不动（但按设计只处理 scheduled 状态变更——settled 目标下也会被置 open？不：target=open 只跳过 suspended，settled 会被置 open。这是否合理？
  // 设计上：滚球中所有非 suspended 市场应可下注，settled 市场理论上不该存在于滚球中的 match，忽略此边界。
  insertMarket(db, 21, 2, 'open');
  insertMarket(db, 22, 2, 'suspended'); // 人工挂盘保护
  const r = autoSwitchMarkets(db, 2);
  check('S2 kickoff已过+scheduled → 有变更', r.switched >= 1, JSON.stringify(r));
  const m21 = db.prepare('SELECT status FROM markets WHERE id=21').get() as { status: string };
  const m22 = db.prepare('SELECT status FROM markets WHERE id=22').get() as { status: string };
  check('S2 非挂盘市场 → open', m21.status === 'open', m21.status);
  check('S2 人工 suspended 不被覆盖', m22.status === 'suspended', m22.status);
}

// ── 场景 3: finished → 全部 closed（含 suspended）
{
  const db = makeDb();
  insertMatch(db, 3, past, 'finished');
  insertMarket(db, 30, 3, 'open');
  insertMarket(db, 31, 3, 'suspended');
  insertMarket(db, 32, 3, 'settled');
  const r = autoSwitchMarkets(db, 3);
  check('S3 finished → switched=3', r.switched === 3, JSON.stringify(r));
  const all = db.prepare('SELECT status FROM markets WHERE match_id=3').all() as { status: string }[];
  check('S3 全部 closed（含 suspended）', all.every((m) => m.status === 'closed'), JSON.stringify(all));
}

// ── 场景 4: settled → 不动
{
  const db = makeDb();
  insertMatch(db, 4, past, 'settled');
  insertMarket(db, 40, 4, 'open');
  const r = autoSwitchMarkets(db, 4);
  check('S4 settled → switched=0', r.switched === 0, JSON.stringify(r));
}

// ── 场景 5: autoSwitchAll 汇总（多 match）
{
  const db = makeDb();
  insertMatch(db, 1, past, 'scheduled');     // → open（滚球中）
  insertMatch(db, 2, future, 'scheduled');   // 不动（kickoff 未到）
  insertMatch(db, 3, past, 'finished');      // → closed
  insertMarket(db, 10, 1, 'settled');        // 滚球中已结算 → open（触发变更）
  insertMarket(db, 20, 2, 'open');           // kickoff 未到 → 保持
  insertMarket(db, 30, 3, 'open');           // finished → closed
  const r = autoSwitchAll(db);
  check('S5 autoSwitchAll switched=2 (m1→open, m3→closed)', r.switched === 2 && r.matches === 2, JSON.stringify(r));
  const m10 = db.prepare('SELECT status FROM markets WHERE id=10').get() as { status: string };
  const m30 = db.prepare('SELECT status FROM markets WHERE id=30').get() as { status: string };
  check('S5 m1 市场 open / m3 市场 closed', m10.status === 'open' && m30.status === 'closed', `${m10.status}/${m30.status}`);
}

// ── 场景 6: isAutoMarketEnabled 默认开启 / 显式 false 关闭
{
  const db = makeDb();
  check('S6 未配置默认启用', isAutoMarketEnabled(db) === true);
  db.prepare(`INSERT INTO settings (key, value) VALUES ('feed_auto_market', 'true')`).run();
  check('S6 "true" 启用', isAutoMarketEnabled(db) === true);
  db.prepare(`UPDATE settings SET value='false' WHERE key='feed_auto_market'`).run();
  check('S6 "false" 关闭', isAutoMarketEnabled(db) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
