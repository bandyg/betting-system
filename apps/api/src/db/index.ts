import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data');
// Optional DB path override (used by isolated e2e/tests to avoid touching live data)
const DB_FILE = process.env.BETTING_DB_PATH ?? join(DATA_DIR, 'betting.db');

export function hashPassword(pw: string): string {
  return createHash('sha256').update(pw).digest('hex');
}

/** 默认密码（旧用户无密码，迁移时统一回填 123456，demo 用） */
export const DEFAULT_PASSWORD = '123456';

export function getDb(): Database.Database {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  const db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: Database.Database): void {
  // Resolve schema.sql in both dev (tsx: src/db/schema.sql) and build (dist/db -> src/db/schema.sql)
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
  ];
  const found = candidates.find((p) => {
    try {
      readFileSync(p);
      return true;
    } catch {
      return false;
    }
  });
  if (!found) throw new Error(`schema.sql not found (tried: ${candidates.join(', ')})`);
  db.exec(readFileSync(found, 'utf8'));

  // 迁移：旧库 users 表无 password 列 → ALTER + 回填默认密码 hash
  const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'password')) {
    db.exec("ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT ''");
  }
  const empty = db.prepare("SELECT COUNT(*) AS n FROM users WHERE password = ''").get() as { n: number };
  if (empty.n > 0) {
    db.prepare("UPDATE users SET password = ? WHERE password = ''").run(hashPassword(DEFAULT_PASSWORD));
  }

  // 迁移：role 列（默认 user）
  const cols2 = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols2.some((c) => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }

  // 迁移：markets.status CHECK 加 'suspended'（SQLite 不能改 CHECK，需重建表）
  // 注意：不能 ALTER TABLE markets RENAME TO markets_old —— 即使 foreign_keys=OFF，
  //   RENAME 仍会把 odds/bets 的外键引用改写为指向 markets_old，drop 后留下悬空引用。
  //   正确顺序：CREATE 新表 → COPY → DROP 旧表 → RENAME 新表为原名（被引用表从未改名）。
  const marketsSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='markets'")
    .get() as { sql: string } | undefined;
  if (marketsSql && !marketsSql.sql.includes('suspended')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE markets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL REFERENCES matches(id),
        type TEXT NOT NULL CHECK (type IN ('1x2', 'ah', 'ou')),
        line REAL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'suspended', 'settled')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO markets_new (id, match_id, type, line, status, created_at)
        SELECT id, match_id, type, line, status, created_at FROM markets;
      DROP TABLE markets;
      ALTER TABLE markets_new RENAME TO markets;
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_markets_match ON markets(match_id)');
    db.pragma('foreign_keys = ON');
  }

  // 迁移：默认风控限额单行（id=1）
  const rl = db.prepare('SELECT id FROM risk_limits WHERE id = 1').get();
  if (!rl) {
    db.prepare(
      `INSERT INTO risk_limits (id, min_stake, max_stake, min_odds, max_odds, max_daily_stake)
       VALUES (1, 1, 100000, 1.01, 1000, 500000)`,
    ).run();
  }

  // 默认 admin 账号（admin / admin123），不存在则创建
  const admin = db.prepare("SELECT id FROM users WHERE name = 'admin'").get() as { id: number } | undefined;
  if (!admin) {
    const info = db
      .prepare("INSERT INTO users (name, password, role) VALUES (?, ?, 'admin')")
      .run('admin', hashPassword('admin123'));
    db.prepare('INSERT INTO accounts (user_id) VALUES (?)').run(Number(info.lastInsertRowid));
  } else {
    // 已存在则确保角色是 admin
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);
  }

  // 迁移（P1 feed 接入）：matches / markets 加供应商溯源字段 + feed_log 表（幂等）
  const addCol = (table: string, name: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  addCol('matches', 'external_id', "external_id TEXT");
  addCol('matches', 'source', "source TEXT NOT NULL DEFAULT 'manual'");
  addCol('matches', 'sport', "sport TEXT");
  addCol('matches', 'league', "league TEXT");
  addCol('markets', 'external_id', "external_id TEXT");
  addCol('markets', 'source', "source TEXT NOT NULL DEFAULT 'manual'");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_matches_ext ON matches(external_id) WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_markets_ext ON markets(external_id) WHERE external_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS feed_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT,
      matches_seen INTEGER,
      matches_upserted INTEGER,
      errors TEXT
    );
  `);

  // 迁移（P3）：settings 键值表 + feed_manual 默认值（手动开盘模式，admin 面板可切换，无需重启）
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('feed_manual', 'true')`).run();
  // 迁移（P4）：feed_auto_settle 默认开启 — 完场比分入库后自动派彩（settleMatch 幂等，可安全重复执行）
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('feed_auto_settle', 'true')`).run();
}

// Ensure schema exists on import (idempotent)
const db = getDb();
migrate(db);

export default db;
