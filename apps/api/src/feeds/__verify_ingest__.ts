// __verify_ingest__.ts (P2) — integration test of ingest.ts on an in-memory DB (no real data touched).
// Run:  node --import tsx apps/api/src/feeds/__verify_ingest__.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { normalizeTheOddsMatch, toRows } from './mapper.js';
import { prematch, finished } from './mock.js';
import { ingestVendorUpdate, upsertMatch } from './ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
function freshDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  return d;
}

let pass = 0;
const fails: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fails.push(name); console.log(`  ✗ ${name}\n     ${(e as Error).message}`); }
}

console.log('== P2 ingest integration ==\n');

check('ingestVendorUpdate: new match inserted with 3 feed markets + odds', () => {
  const db = freshDb();
  const res = ingestVendorUpdate(db, [prematch], 'mock');
  assert.deepEqual({ seen: res.seen, inserted: res.inserted, updated: res.updated }, { seen: 1, inserted: 1, updated: 0 });
  const m = db.prepare("SELECT * FROM matches WHERE external_id='ext-m-1001'").get() as any;
  assert.equal(m.source, 'mock');
  assert.equal(m.status, 'scheduled');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM markets WHERE match_id=?').get(m.id).n, 3);
  const mk = db.prepare('SELECT COUNT(*) n FROM odds o JOIN markets k ON o.market_id=k.id WHERE k.match_id=?').get(m.id).n;
  assert.equal(mk, 7, '3 (1x2) + 2 (ah) + 2 (ou) = 7 odds rows');
});

check('ingestVendorUpdate: re-ingest is idempotent (no duplicates, 1 update)', () => {
  const db = freshDb();
  ingestVendorUpdate(db, [prematch], 'mock');
  const res2 = ingestVendorUpdate(db, [prematch], 'mock');
  assert.deepEqual({ inserted: res2.inserted, updated: res2.updated }, { inserted: 0, updated: 1 });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM matches WHERE external_id='ext-m-1001'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM markets WHERE external_id LIKE 'ext-m-1001%'").get().n, 3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM odds').get().n, 7);
});

check('re-ingest refreshes odds price (feed-owned)', () => {
  const db = freshDb();
  ingestVendorUpdate(db, [prematch], 'mock');
  db.prepare("UPDATE odds SET price=9.99 WHERE market_id=(SELECT id FROM markets WHERE external_id='ext-m-1001:1x2') AND selection='home'").run();
  ingestVendorUpdate(db, [prematch], 'mock'); // re-ingest restores 2.1
  const p = db.prepare("SELECT price FROM odds WHERE market_id=(SELECT id FROM markets WHERE external_id='ext-m-1001:1x2') AND selection='home'").get() as { price: number };
  assert.equal(p.price, 2.1);
});

check('source isolation: manual-taken-over market price NOT overwritten', () => {
  const db = freshDb();
  ingestVendorUpdate(db, [prematch], 'mock');
  // admin "takes over" the 1x2 market and sets its own price
  const mkId = (db.prepare("SELECT id FROM markets WHERE external_id='ext-m-1001:1x2'").get() as { id: number }).id;
  db.prepare("UPDATE markets SET source='manual' WHERE id=?").run(mkId);
  db.prepare("UPDATE odds SET price=8.88 WHERE market_id=? AND selection='home'").run(mkId);
  ingestVendorUpdate(db, [prematch], 'mock'); // feed must NOT touch manual market
  const p = db.prepare("SELECT price FROM odds WHERE market_id=? AND selection='home'").get(mkId) as { price: number };
  assert.equal(p.price, 8.88, 'manual admin price preserved despite re-ingest');
});

check('finished match → status finished + scores persisted', () => {
  const db = freshDb();
  const ing = normalizeTheOddsMatch(finished);
  upsertMatch(db, toRows(ing, 'mock'));
  const m = db.prepare("SELECT * FROM matches WHERE external_id='ext-m-1001'").get() as any;
  assert.equal(m.status, 'finished');
  assert.equal(m.home_score, 2);
  assert.equal(m.away_score, 1);
});

check('feed_log records ok row per ingest', () => {
  const db = freshDb();
  ingestVendorUpdate(db, [prematch], 'mock');
  const log = db.prepare("SELECT status, matches_seen, matches_upserted FROM feed_log").get() as any;
  assert.equal(log.status, 'ok');
  assert.equal(log.matches_seen, 1);
  assert.equal(log.matches_upserted, 1);
});

console.log(`\n== ${pass} passed, ${fails.length} failed ==`);
if (fails.length) process.exit(1);
process.exit(0);
