// demo_seed.ts (P2) — push 2 mock feed matches into the REAL db to verify end-to-end ingestion.
// Run:  node --import tsx apps/api/src/feeds/demo_seed.ts
import db from '../db/index.js';
import { ingestVendorUpdate } from './ingest.js';
import type { TheOddsMatch } from './mapper.js';

const demos: TheOddsMatch[] = [
  {
    id: 'ext-demo-a001', sport_title: 'Demo League', home_team: 'FeedDemo Home A1', away_team: 'FeedDemo Away A1',
    commence_time: new Date(Date.now() + 36e5 * 50).toISOString(),
    bookmakers: [{ key: 'pinnacle', markets: [
      { key: 'h2h', outcomes: [{ name: 'FeedDemo Home A1', price: 1.9 }, { name: 'FeedDemo Away A1', price: 4.1 }, { name: 'Draw', price: 3.4 }] },
      { key: 'spreads', outcomes: [{ name: 'FeedDemo Home A1', price: 1.85, point: -1 }, { name: 'FeedDemo Away A1', price: 1.95, point: 1 }] },
      { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 2.5 }, { name: 'Under', price: 1.7, point: 2.5 }] },
    ] }],
    scores: null, completed: false,
  },
  {
    id: 'ext-demo-b002', sport_title: 'Demo League', home_team: 'FeedDemo Home B2', away_team: 'FeedDemo Away B2',
    commence_time: new Date(Date.now() + 36e5 * 60).toISOString(),
    bookmakers: [{ key: 'pinnacle', markets: [
      { key: 'h2h', outcomes: [{ name: 'FeedDemo Home B2', price: 2.2 }, { name: 'FeedDemo Away B2', price: 3.1 }, { name: 'Draw', price: 3.2 }] },
    ] }],
    scores: null, completed: false,
  },
];

const res = ingestVendorUpdate(db, demos, 'the-odds-api', { overwriteManualOdds: false });
console.log(JSON.stringify(res, null, 2));
const feedMatches = db.prepare("SELECT id, home_team, away_team, status, source, external_id, kickoff_time FROM matches WHERE source = 'the-odds-api'").all() as Array<{
  id: number; home_team: string; away_team: string; status: string; source: string; external_id: string; kickoff_time: string;
}>;
console.log('feed matches now in DB:', feedMatches.length);
for (const m of feedMatches) console.log(' ', m.id, m.home_team, 'vs', m.away_team, '|', m.status, '|', m.source, '|', m.external_id);
