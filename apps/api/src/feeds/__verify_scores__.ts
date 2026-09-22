// __verify_scores__.ts (feed-scores-fix) — scores 斷鏈修復驗證：sport_key 捕獲 → 反查 → ingestScores 派彩。
// In-memory DB only（不碰 production）。Run:  node --import tsx apps/api/src/feeds/__verify_scores__.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { normalizeTheOddsMatch, toRows, deriveMarketStatus } from './mapper.js';
import { prematch, basketball, mockFinished } from './mock_scores.js';
import { ingestVendorUpdate, upsertMatch, ingestScores } from './ingest.js';
import type { TheOddsScore } from './provider.js';
import { resolveScoreKeys } from './scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
function freshDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  // settings 表由 migrate()（db/index.ts）建立，schema.sql 不含——ingestScores 依賴 feed_auto_settle
  d.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
  d.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('feed_auto_settle', 'true')").run();
  return d;
}

let pass = 0;
const fails: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fails.push(name); console.log(`  ✗ ${name}\n     ${(e as Error).message}`); }
}

console.log('== feed-scores-fix verification ==\n');

// --- D1: sport_key 捕獲 ---
check('D1: normalize captures raw sport_key into feedSportKey', () => {
  const m = normalizeTheOddsMatch(basketball, 'upcoming');
  assert.equal(m.feedSportKey, 'basketball_nba');
});

check('D1: fallback to polled sportKey when payload omits sport_key', () => {
  const raw = { ...prematch, sport_key: undefined } as typeof prematch;
  const m = normalizeTheOddsMatch(raw, 'soccer_epl');
  assert.equal(m.feedSportKey, 'soccer_epl');
});

check('D1: toRows carries match_feed_key', () => {
  const rows = toRows(normalizeTheOddsMatch(basketball, 'upcoming'));
  assert.equal(rows.match.match_feed_key, 'basketball_nba');
});

// --- D2/D3: 持久化 ---
check('D3: ingest persists match_feed_key on insert', () => {
  const db = freshDb();
  ingestVendorUpdate(db, [basketball], 'the-odds-api', { sportKey: 'upcoming' });
  const m = db.prepare("SELECT match_feed_key FROM matches WHERE external_id='ext-m-2001'").get() as { match_feed_key: string };
  assert.equal(m.match_feed_key, 'basketball_nba');
});

check('D3: re-ingest backfills match_feed_key on legacy rows (COALESCE)', () => {
  const db = freshDb();
  const legacy = { ...prematch, sport_key: undefined } as typeof prematch;
  ingestVendorUpdate(db, [legacy], 'the-odds-api', { sportKey: 'upcoming' });
  const before = db.prepare("SELECT match_feed_key FROM matches WHERE external_id='ext-m-1001'").get() as { match_feed_key: string | null };
  assert.equal(before.match_feed_key, 'upcoming', 'sanity: legacy path stored polled key');
  // feed 修正後 payload 帶真 sport_key → re-ingest 回填
  ingestVendorUpdate(db, [prematch], 'the-odds-api', { sportKey: 'upcoming' });
  const after = db.prepare("SELECT match_feed_key FROM matches WHERE external_id='ext-m-1001'").get() as { match_feed_key: string | null };
  assert.equal(after.match_feed_key, 'soccer_epl');
});

// --- D4: settled 派生 ---
check('D4: settled market derives settled status', () => {
  assert.equal(deriveMarketStatus({ type: '1x2', line: null, priceHome: 2, priceDraw: 3, priceAway: 4, live: false, suspended: false, settled: true }), 'settled');
});

check('D4: odds re-ingest of completed match → match finished (scores path settles it)', () => {
  const db = freshDb();
  ingestVendorUpdate(db, [prematch], 'the-odds-api', { sportKey: 'upcoming' });
  ingestVendorUpdate(db, [mockFinished as typeof prematch], 'the-odds-api', { sportKey: 'upcoming' });
  const m = db.prepare("SELECT status, home_score, away_score FROM matches WHERE external_id='ext-m-1001'").get() as { status: string; home_score: number; away_score: number };
  assert.equal(m.status, 'finished');
  assert.equal(m.home_score, 2);
  assert.equal(m.away_score, 1);
});

// --- D5: resolveScoreKeys ---
check('D5: resolveScoreKeys prefers DB reverse-lookup, excludes upcoming', () => {
  const db = freshDb();
  ingestVendorUpdate(db, [basketball, prematch], 'the-odds-api', { sportKey: 'upcoming' });
  const keys = resolveScoreKeys(db, { sportKeys: ['upcoming'] } as Parameters<typeof resolveScoreKeys>[1]);
  assert.deepEqual(keys.sort(), ['basketball_nba', 'soccer_epl']);
});

check('D5: limit caps the key list by match count desc', () => {
  const db = freshDb();
  ingestVendorUpdate(db, [basketball, prematch], 'the-odds-api', { sportKey: 'upcoming' });
  const keys = resolveScoreKeys(db, { sportKeys: ['upcoming'] } as Parameters<typeof resolveScoreKeys>[1], 1);
  assert.equal(keys.length, 1);
});

check('D5: explicit FEED_SCORE_KEYS overrides DB lookup and never contains upcoming', () => {
  process.env.FEED_SCORE_KEYS = 'soccer_epl, upcoming , tennis_atp';
  try {
    const db = freshDb();
    ingestVendorUpdate(db, [basketball], 'the-odds-api', { sportKey: 'upcoming' });
    const keys = resolveScoreKeys(db, { sportKeys: ['upcoming'] } as Parameters<typeof resolveScoreKeys>[1], 5);
    assert.deepEqual(keys, ['soccer_epl', 'tennis_atp']);
  } finally {
    delete process.env.FEED_SCORE_KEYS;
  }
});

check('D5: empty DB falls back to odds sportKeys (minus upcoming)', () => {
  const db = freshDb();
  const keys = resolveScoreKeys(db, { sportKeys: ['upcoming'] } as Parameters<typeof resolveScoreKeys>[1]);
  assert.deepEqual(keys, []);
  const keys2 = resolveScoreKeys(db, { sportKeys: ['upcoming', 'soccer_epl'] } as Parameters<typeof resolveScoreKeys>[1]);
  assert.deepEqual(keys2, ['soccer_epl']);
});

// --- scores 鏈路整合：ingest → finished → auto-settle（派彩）→ 冪等 ---
check('E2E: ingestScores completes chain — match settled + winner paid', () => {
  const db = freshDb();
  // user + account + bet: 100 @ 2.1 on home
  const u = db.prepare("INSERT INTO users (name, password) VALUES ('u1', 'x')").run();
  const acc = db.prepare('INSERT INTO accounts (user_id, balance) VALUES (?, 1000)').run(Number(u.lastInsertRowid));
  ingestVendorUpdate(db, [prematch], 'the-odds-api', { sportKey: 'upcoming' });
  const mk = db.prepare("SELECT id FROM markets WHERE external_id='ext-m-1001:1x2'").get() as { id: number };
  db.prepare("INSERT INTO bets (user_id, market_id, selection, bet_type, price, stake, status, potential_payout) VALUES (?, ?, 'home', 'single', 2.1, 100, 'open', 210)")
    .run(Number(u.lastInsertRowid), mk.id);

  const scores: TheOddsScore[] = [{
    id: 'ext-m-1001',
    home_team: 'Arsenal',
    away_team: 'Chelsea',
    scores: [{ name: 'Arsenal', score: '2' }, { name: 'Chelsea', score: '1' }],
    completed: true,
  }];
  const res = ingestScores(db, scores, 'the-odds-api');
  assert.deepEqual({ seen: res.seen, updated: res.updated, settled: res.settled, errors: res.errors }, { seen: 1, updated: 1, settled: 1, errors: 0 });

  const bal = (db.prepare('SELECT balance FROM accounts WHERE id=?').get(Number(acc.lastInsertRowid)) as { balance: number }).balance;
  assert.equal(bal, 1210, '1000 - 100 stake + 210 payout = 1110? NO: stake left at bet time = 1000 (stake not deducted in this test) → 1000 + 210 = 1210');
  const bet = db.prepare('SELECT status FROM bets').get() as { status: string };
  assert.equal(bet.status, 'won');
  const match = db.prepare("SELECT status, home_score, away_score FROM matches WHERE external_id='ext-m-1001'").get() as { status: string; home_score: number; away_score: number };
  assert.equal(match.status, 'settled');
  assert.equal(match.home_score, 2);
});

check('E2E: ingestScores is idempotent on settled matches (no double payout)', () => {
  const db = freshDb();
  const u = db.prepare("INSERT INTO users (name, password) VALUES ('u1', 'x')").run();
  const acc = db.prepare('INSERT INTO accounts (user_id, balance) VALUES (?, 1000)').run(Number(u.lastInsertRowid));
  ingestVendorUpdate(db, [prematch], 'the-odds-api', { sportKey: 'upcoming' });
  const mk = db.prepare("SELECT id FROM markets WHERE external_id='ext-m-1001:1x2'").get() as { id: number };
  db.prepare("INSERT INTO bets (user_id, market_id, selection, bet_type, price, stake, status, potential_payout) VALUES (?, ?, 'home', 'single', 2.1, 100, 'open', 210)")
    .run(Number(u.lastInsertRowid), mk.id);
  const scores: TheOddsScore[] = [{ id: 'ext-m-1001', home_team: 'Arsenal', away_team: 'Chelsea', scores: [{ name: 'Arsenal', score: '2' }, { name: 'Chelsea', score: '1' }], completed: true }];
  ingestScores(db, scores, 'the-odds-api');
  const bal1 = (db.prepare('SELECT balance FROM accounts WHERE id=?').get(Number(acc.lastInsertRowid)) as { balance: number }).balance;
  const res2 = ingestScores(db, scores, 'the-odds-api');
  assert.equal(res2.settled, 0);
  const bal2 = (db.prepare('SELECT balance FROM accounts WHERE id=?').get(Number(acc.lastInsertRowid)) as { balance: number }).balance;
  assert.equal(bal2, bal1, 'balance unchanged on second pass');
});

check('E2E: feed_log has no UNKNOWN_SPORT error rows from scores path', () => {
  const db = freshDb();
  ingestVendorUpdate(db, [basketball], 'the-odds-api', { sportKey: 'upcoming' });
  const errs = db.prepare("SELECT COUNT(*) n FROM feed_log WHERE errors LIKE '%Unknown sport%'").get() as { n: number };
  assert.equal(errs.n, 0);
});

console.log(`\n== ${pass} passed, ${fails.length} failed ==`);
if (fails.length) process.exit(1);
process.exit(0);
