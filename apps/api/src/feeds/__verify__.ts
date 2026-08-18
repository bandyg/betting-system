// __verify__.ts (P1) — runnable unit verification of mapper.ts using mock the-odds-api payloads.
// No DB access. Run:  node --import tsx apps/api/src/feeds/__verify__.ts
import assert from 'node:assert/strict';
import { normalizeTheOddsMatch, toRows } from './mapper.js';
import { prematch, finished, h2hOnly } from './mock.js';

let pass = 0;
const fails: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fails.push(name); console.log(`  ✗ ${name}\n     ${(e as Error).message}`); }
}

console.log('== P1 mapper verification ==\n');

check('prematch: normalize produces 3 markets (1x2/ah/ou)', () => {
  const m = normalizeTheOddsMatch(prematch);
  assert.equal(m.markets.length, 3);
  assert.deepEqual(m.markets.map((x) => x.type).sort(), ['1x2', 'ah', 'ou']);
});

check('prematch: 1x2 prices mapped home/draw/away', () => {
  const m = normalizeTheOddsMatch(prematch);
  const x12 = m.markets.find((x) => x.type === '1x2')!;
  assert.equal(x12.priceHome, 2.1);
  assert.equal(x12.priceDraw, 3.4);
  assert.equal(x12.priceAway, 3.6);
});

check('prematch: AH line from home-point (-1.5) + home/away price', () => {
  const m = normalizeTheOddsMatch(prematch);
  const ah = m.markets.find((x) => x.type === 'ah')!;
  assert.equal(ah.line, -1.5);
  assert.equal(ah.priceHome, 1.9);
  assert.equal(ah.priceAway, 1.8);
});

check('prematch: OU line=2.5, over/under price', () => {
  const m = normalizeTheOddsMatch(prematch);
  const ou = m.markets.find((x) => x.type === 'ou')!;
  assert.equal(ou.line, 2.5);
  assert.equal(ou.priceHome, 1.85); // over
  assert.equal(ou.priceAway, 1.7);  // under
});

check('prematch toRows: match status scheduled (no final score, market open)', () => {
  const rows = toRows(normalizeTheOddsMatch(prematch));
  assert.equal(rows.match.status, 'scheduled');
  assert.equal(rows.match.home_score, null);
});

check('prematch toRows: all market status open + source set', () => {
  const rows = toRows(normalizeTheOddsMatch(prematch));
  assert.equal(rows.markets.length, 3);
  assert.ok(rows.markets.every((mk) => mk.status === 'open'));
  assert.ok(rows.markets.every((mk) => mk.source === 'the-odds-api'));
  assert.equal(rows.match.source, 'the-odds-api');
});

check('prematch toRows: market external_id is deterministic compound', () => {
  const rows = toRows(normalizeTheOddsMatch(prematch));
  const ids = rows.markets.map((mk) => mk.external_id);
  assert.deepEqual(ids, ['ext-m-1001:1x2', 'ext-m-1001:ah:-1.5', 'ext-m-1001:ou:2.5']);
});

check('prematch toRows: odds rows — 1x2 has home/draw/away (3)', () => {
  const rows = toRows(normalizeTheOddsMatch(prematch));
  const x12 = rows.markets.find((mk) => mk.type === '1x2')!;
  assert.deepEqual(x12.odds.map((o) => o.selection), ['home', 'draw', 'away']);
});

check('prematch toRows: ah odds — home/away only (no draw)', () => {
  const rows = toRows(normalizeTheOddsMatch(prematch));
  const ah = rows.markets.find((mk) => mk.type === 'ah')!;
  assert.deepEqual(ah.odds.map((o) => o.selection), ['home', 'away']);
});

check('prematch toRows: ou odds — over/under', () => {
  const rows = toRows(normalizeTheOddsMatch(prematch));
  const ou = rows.markets.find((mk) => mk.type === 'ou')!;
  assert.deepEqual(ou.odds.map((o) => o.selection), ['over', 'under']);
});

check('finished: final score → status finished + scores persisted', () => {
  const rows = toRows(normalizeTheOddsMatch(finished));
  assert.equal(rows.match.status, 'finished');
  assert.equal(rows.match.home_score, 2);
  assert.equal(rows.match.away_score, 1);
});

check('h2hOnly: missing AH/OU → only 1 market (1x2)', () => {
  const rows = toRows(normalizeTheOddsMatch(h2hOnly));
  assert.equal(rows.markets.length, 1);
  assert.equal(rows.markets[0].type, '1x2');
});

check('h2hOnly: priceDraw not null; ah/ou absent', () => {
  const rows = toRows(normalizeTheOddsMatch(h2hOnly));
  const x12 = rows.markets[0];
  assert.equal(x12.odds.find((o) => o.selection === 'draw')!.price, 4.2);
});

console.log(`\n== ${pass} passed, ${fails.length} failed ==`);
if (fails.length) process.exit(1);
process.exit(0);
