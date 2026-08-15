import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data');

export function hashPassword(pw: string): string {
  return createHash('sha256').update(pw).digest('hex');
}

/** 默认密码（旧用户无密码，迁移时统一回填 123456，demo 用） */
export const DEFAULT_PASSWORD = '123456';

export function getDb(): Database.Database {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(join(DATA_DIR, 'betting.db'));
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
}

// Ensure schema exists on import (idempotent)
const db = getDb();
migrate(db);

export default db;
