import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data');

export function getDb(): Database.Database {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(join(DATA_DIR, 'betting.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: Database.Database): void {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(sql);
}

// Ensure schema exists on import (idempotent)
const db = getDb();
migrate(db);

export default db;
