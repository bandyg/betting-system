// mock.ts (P1) — realistic the-odds-api style payloads for unit testing the mapper.
import type { TheOddsMatch } from './mapper.js';

/** Pre-match: 1x2 + AH + O/U all open, no scores. */
export const prematch: TheOddsMatch = {
  id: 'ext-m-1001',
  sport_title: 'English Premier League',
  home_team: 'Arsenal',
  away_team: 'Chelsea',
  commence_time: '2026-08-20T19:00:00.000Z',
  bookmakers: [
    { key: 'pinnacle', markets: [
      { key: 'h2h', outcomes: [
        { name: 'Arsenal', price: 2.1 }, { name: 'Chelsea', price: 3.6 }, { name: 'Draw', price: 3.4 },
      ] },
      { key: 'spreads', outcomes: [
        { name: 'Arsenal', price: 1.9, point: -1.5 }, { name: 'Chelsea', price: 1.8, point: 1.5 },
      ] },
      { key: 'totals', outcomes: [
        { name: 'Over', price: 1.85, point: 2.5 }, { name: 'Under', price: 1.7, point: 2.5 },
      ] },
    ] },
  ],
  scores: null,
  completed: false,
};

/** Finished: same external id, scores set, completed true (drives status → 'finished'). */
export const finished: TheOddsMatch = {
  ...prematch,
  scores: [{ name: 'Arsenal', score: 2 }, { name: 'Chelsea', score: 1 }],
  completed: true,
};

/** 1x2 only (no AH / O/U offered) — edge case for missing markets. */
export const h2hOnly: TheOddsMatch = {
  id: 'ext-m-2002',
  sport_title: 'La Liga',
  home_team: 'Real Madrid',
  away_team: 'Barcelona',
  commence_time: '2026-08-21T20:00:00.000Z',
  bookmakers: [
    { key: 'pinnacle', markets: [
      { key: 'h2h', outcomes: [
        { name: 'Real Madrid', price: 1.55 }, { name: 'Barcelona', price: 5.5 }, { name: 'Draw', price: 4.2 },
      ] },
    ] },
  ],
  scores: null,
  completed: false,
};
