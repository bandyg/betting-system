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


/** Basketball (NBA) -- h2h + spreads + totals, no draw. */
export const basketball: TheOddsMatch = {
  id: "ext-bball-3001",
  sport_title: "NBA",
  home_team: "Los Angeles Lakers",
  away_team: "Boston Celtics",
  commence_time: "2026-08-21T02:00:00.000Z",
  bookmakers: [
    { key: "pinnacle", markets: [
      { key: "h2h", outcomes: [
        { name: "Los Angeles Lakers", price: 1.85 }, { name: "Boston Celtics", price: 2.05 },
      ] },
      { key: "spreads", outcomes: [
        { name: "Los Angeles Lakers", price: 1.9, point: -3.5 }, { name: "Boston Celtics", price: 1.9, point: 3.5 },
      ] },
      { key: "totals", outcomes: [
        { name: "Over", price: 1.9, point: 220.5 }, { name: "Under", price: 1.9, point: 220.5 },
      ] },
    ] },
  ],
  scores: null,
  completed: false,
};

/** Tennis (ATP) -- h2h only (2-way). */
export const tennis: TheOddsMatch = {
  id: "ext-tennis-4001",
  sport_title: "ATP",
  home_team: "Carlos Alcaraz",
  away_team: "Novak Djokovic",
  commence_time: "2026-08-21T14:00:00.000Z",
  bookmakers: [
    { key: "pinnacle", markets: [
      { key: "h2h", outcomes: [
        { name: "Carlos Alcaraz", price: 1.55 }, { name: "Novak Djokovic", price: 2.50 },
      ] },
    ] },
  ],
  scores: null,
  completed: false,
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
