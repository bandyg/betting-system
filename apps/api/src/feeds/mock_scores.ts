// mock_scores.ts (feed-scores-fix) — payloads with explicit sport_key for the upcoming-mode tests.
import type { TheOddsMatch } from './mapper.js';

/** Upcoming-mode prematch: payload carries the real sport_key (what /odds?sport=upcoming returns). */
export const prematch: TheOddsMatch = {
  id: 'ext-m-1001',
  sport_key: 'soccer_epl',
  sport_title: 'English Premier League',
  home_team: 'Arsenal',
  away_team: 'Chelsea',
  commence_time: '2026-08-20T19:00:00.000Z',
  bookmakers: [
    { key: 'pinnacle', markets: [
      { key: 'h2h', outcomes: [
        { name: 'Arsenal', price: 2.1 }, { name: 'Chelsea', price: 3.6 }, { name: 'Draw', price: 3.4 },
      ] },
    ] },
  ],
  scores: null,
  completed: false,
};

/** Same match after completion, re-flowed through the odds endpoint (completed + scores set). */
export const mockFinished: TheOddsMatch = {
  ...prematch,
  completed: true,
  scores: [{ name: 'Arsenal', score: '2' }, { name: 'Chelsea', score: '1' }],
  bookmakers: [], // 完賽後 bookmakers 通常清空 → 市場全 settled（deriveMarketStatus 生效路徑）
};

/** NBA prematch with its own sport_key (multi-sport reverse-lookup test). */
export const basketball: TheOddsMatch = {
  id: 'ext-m-2001',
  sport_key: 'basketball_nba',
  sport_title: 'NBA',
  home_team: 'Los Angeles Lakers',
  away_team: 'Boston Celtics',
  commence_time: '2026-08-21T02:30:00.000Z',
  bookmakers: [
    { key: 'pinnacle', markets: [
      { key: 'h2h', outcomes: [
        { name: 'Los Angeles Lakers', price: 1.85 }, { name: 'Boston Celtics', price: 1.95 },
      ] },
    ] },
  ],
  scores: null,
  completed: false,
};
