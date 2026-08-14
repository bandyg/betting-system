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
}

// Ensure schema exists on import (idempotent)
const db = getDb();
migrate(db);

export default db;
