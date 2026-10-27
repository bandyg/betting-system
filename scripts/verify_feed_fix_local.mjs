#!/usr/bin/env node
/**
 * verify_feed_fix_local.mjs
 *
 * Self-contained, offline integration harness for the sports feed fixes.
 *
 * It starts a fake the-odds-api server on 127.0.0.1, points the real feed code at
 * it via FEED_API_BASE, opens a throwaway SQLite DB through apps/api/dist/db/index.js,
 * and drives the pipeline through the exported scheduler/provider helpers.
 *
 * Run from the repo root:
 *   node scripts/verify_feed_fix_local.mjs
 *
 * Requirements:
 *   - apps/api/dist must already be built and expose the fixed feed contract.
 *   - No npm dependencies, no real network access, no production DB access.
 */

const http = await import('node:http');
const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const { fileURLToPath, pathToFileURL } = await import('node:url');
const { createRequire } = await import('node:module');

const TOTAL_ASSERTIONS = 6;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const apiDir = path.join(repoRoot, 'apps', 'api');
const distDir = path.join(apiDir, 'dist');
const dbModulePath = path.join(distDir, 'db', 'index.js');
const schedulerPath = path.join(distDir, 'feeds', 'scheduler.js');
const providerPath = path.join(distDir, 'feeds', 'provider.js');

let passed = 0;
let fake = null;
let db = null;
let tmpDir = null;
let realFetch = null;
let buildReady = true;

function show(value, max = 360) {
  if (value === undefined) return 'undefined';
  let text;
  try {
    text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) text = String(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function countFeedLog(targetDb, status) {
  if (status) {
    return targetDb.prepare('SELECT COUNT(*) AS c FROM feed_log WHERE status = ?').get(status).c;
  }
  return targetDb.prepare('SELECT COUNT(*) AS c FROM feed_log').get().c;
}

async function assertion(name, fn) {
  try {
    const detail = await fn();
    passed += 1;
    console.log(`PASS ${name}${detail ? `: ${detail}` : ''}`);
  } catch (error) {
    const expected = error && Object.prototype.hasOwnProperty.call(error, 'expected') ? error.expected : undefined;
    const actual = error && Object.prototype.hasOwnProperty.call(error, 'actual') ? error.actual : undefined;
    let line = `FAIL ${name}`;
    if (expected !== undefined || actual !== undefined) {
      line += ` expected=${show(expected)} actual=${show(actual)}`;
    }
    const reason = error && error.message ? String(error.message).split('\n')[0] : 'assertion failed';
    line += ` (${reason})`;
    console.log(line);
    error.__assertionName = name;
    throw error;
  }
}

function startFakeServer() {
  const state = {
    quotaMode: false,
    requests: 0,
    counts: new Map(),
    scoreCalls: [],
    lastQuota: null,
    lastOddsEvents: null,
    oddsIds: ['verify-evt-1', 'verify-evt-2'],
  };

  const nowIso = () => new Date().toISOString();

  function makeOddsEvent(index, offsetMs) {
    const home = index === 0 ? 'Verify Home' : 'Verify Home Two';
    const away = index === 0 ? 'Verify Away' : 'Verify Away Two';
    return {
      id: state.oddsIds[index],
      sport_key: 'soccer_epl',
      sport_title: 'EPL',
      commence_time: new Date(Date.now() + offsetMs).toISOString(),
      home_team: home,
      away_team: away,
      bookmakers: [
        {
          key: 'pinnacle',
          title: 'Pinnacle',
          last_update: nowIso(),
          markets: [
            {
              key: 'h2h',
              last_update: nowIso(),
              outcomes: [
                { name: home, price: 1.85 + index * 0.1 },
                { name: away, price: 2.05 + index * 0.1 },
              ],
            },
            {
              key: 'totals',
              last_update: nowIso(),
              outcomes: [
                { name: 'Over', price: 1.9 + index * 0.05, point: 2.5 },
                { name: 'Under', price: 1.95 + index * 0.05, point: 2.5 },
              ],
            },
          ],
        },
      ],
    };
  }

  function sendJson(res, status, body, quota) {
    res.writeHead(status, {
      'content-type': 'application/json',
      'x-requests-remaining': String(quota.remaining),
      'x-requests-used': String(quota.used),
      'x-requests-last': String(quota.last ?? 1),
    });
    res.end(JSON.stringify(body));
  }

  function parseRoute(url) {
    const primary = url.pathname.match(/\/sports\/([^/]+)\/(odds|scores)\/?$/);
    const fallback = url.pathname.match(/^\/([^/]+)\/(odds|scores)\/?$/);
    const match = primary || fallback;
    if (!match) return null;
    return { key: decodeURIComponent(match[1]), kind: match[2] };
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    state.requests += 1;
    state.counts.set(url.pathname, (state.counts.get(url.pathname) || 0) + 1);

    if (state.quotaMode) {
      sendJson(res, 401, {
        message: 'Usage quota has been reached. Please upgrade your plan.',
        error_code: 'OUT_OF_USAGE_CREDITS',
      }, { remaining: 0, used: 500, last: 1 });
      return;
    }

    const route = parseRoute(url);
    if (!route) {
      sendJson(res, 404, { message: `unknown fake route: ${url.pathname}` }, { remaining: 480, used: 20, last: 1 });
      return;
    }

    if (route.kind === 'odds') {
      const events = [makeOddsEvent(0, 2 * 60 * 60 * 1000), makeOddsEvent(1, 26 * 60 * 60 * 1000)];
      state.lastOddsEvents = events;
      const quota = { remaining: 480, used: 20, last: 1 };
      state.lastQuota = { ...quota };
      sendJson(res, 200, events, quota);
      return;
    }

    // /scores/ — the real vendor returns no rows unless a daysFrom window is supplied.
    const rawDaysFrom = url.searchParams.get('daysFrom');
    state.scoreCalls.push({
      key: route.key,
      path: url.pathname,
      query: url.search,
      daysFrom: rawDaysFrom,
    });

    const quota = { remaining: 479, used: 21, last: 1 };
    state.lastQuota = { ...quota };

    if (rawDaysFrom == null || rawDaysFrom === '') {
      sendJson(res, 200, [], quota);
      return;
    }

    const base = state.lastOddsEvents && state.lastOddsEvents[0];
    const home = base ? base.home_team : 'Verify Home';
    const away = base ? base.away_team : 'Verify Away';
    const completed = {
      id: base ? base.id : state.oddsIds[0],
      sport_key: 'soccer_epl',
      sport_title: 'EPL',
      commence_time: base ? base.commence_time : nowIso(),
      home_team: home,
      away_team: away,
      completed: true,
      scores: [
        { name: home, score: 2 },
        { name: away, score: 1 },
      ],
    };
    sendJson(res, 200, [completed], quota);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        port: address.port,
        state,
        oddsId: state.oddsIds[0],
        setQuotaMode(enabled) {
          state.quotaMode = Boolean(enabled);
        },
        getTotalRequests() {
          return state.requests;
        },
        getScoreCalls() {
          return state.scoreCalls;
        },
        getCounts() {
          return state.counts;
        },
        get lastQuota() {
          return state.lastQuota;
        },
        async close() {
          if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
          }
          await new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

function installLocalOnlyFetchGuard() {
  realFetch = globalThis.fetch;
  globalThis.fetch = function guardedFetch(input, init) {
    let href;
    if (typeof input === 'string') href = input;
    else if (input instanceof URL) href = input.href;
    else if (input && typeof input.url === 'string') href = input.url;
    else href = String(input);

    let host = '';
    try {
      host = new URL(href).hostname;
    } catch {
      host = '';
    }
    const local = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
    if (!local) {
      return Promise.reject(new Error(`[harness] blocked outbound fetch to non-local host: ${href}`));
    }
    return realFetch(input, init);
  };
}

async function main() {
  if (!fs.existsSync(distDir)) {
    console.error('BUILD NOT READY: apps/api/dist is missing.');
    console.error('Rebuild the API (cd apps/api && pnpm build) and re-run: node scripts/verify_feed_fix_local.mjs');
    buildReady = false;
    return;
  }

  fake = await startFakeServer();
  installLocalOnlyFetchGuard();

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betting-feed-verify-'));
  const dbPath = path.join(tmpDir, 'betting.db');

  // IMPORTANT: every env knob must be set before importing the app modules.
  process.env.BETTING_DB_PATH = dbPath;
  process.env.FEED_API_BASE = `http://127.0.0.1:${fake.port}`;
  process.env.FEED_API_KEY = 'test-key';
  process.env.FEED_ENABLED = '1';
  process.env.FEED_SPORT_KEYS = 'soccer_epl';
  process.env.FEED_INTERVAL_MIN = '240';
  process.env.FEED_SCORES_EVERY = '2';
  process.env.FEED_SCORES_DAYS_FROM = '3';
  process.env.FEED_WINDOW_DAYS = '7';
  process.env.FEED_QUOTA_BACKOFF_MIN = '60';
  process.env.FEED_SCORE_LOOKBACK_DAYS = '3';
  // Determinism: ignore any host-level feed secrets for these knobs.
  process.env.FEED_SCORE_KEYS = '';
  process.env.FEED_PROVIDER = 'the-odds-api';

  const dbModule = await import(pathToFileURL(dbModulePath).href);
  db = dbModule.default ?? (typeof dbModule.getDb === 'function' ? dbModule.getDb() : null);
  if (!db) {
    throw new Error('apps/api/dist/db/index.js did not expose a database handle');
  }

  // Keep the harness focused on feed behavior: no manual-mode skip, no auto-settle,
  // no auto market status rewrite (the old autoMarket writes 'closed', which the
  // schema intentionally does not allow).
  const setSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  setSetting.run('feed_manual', 'false');
  setSetting.run('feed_auto_settle', 'false');
  setSetting.run('feed_auto_market', 'false');

  let scheduler;
  let provider;
  try {
    scheduler = await import(pathToFileURL(schedulerPath).href);
    provider = await import(pathToFileURL(providerPath).href);
  } catch (error) {
    console.error(`BUILD NOT READY: could not import the feed modules: ${error.message}`);
    console.error('Rebuild the API (cd apps/api && pnpm build) and re-run: node scripts/verify_feed_fix_local.mjs');
    buildReady = false;
    return;
  }

  const requiredScheduler = ['pollOnce', 'runPollTick', 'resolveScoreKeys', 'readFeedConfig'];
  const missing = requiredScheduler.filter((name) => typeof scheduler[name] !== 'function');
  if (typeof provider.getLastQuota !== 'function') missing.push('getLastQuota');
  if (typeof provider.ProviderError !== 'function') missing.push('ProviderError');

  if (missing.length > 0) {
    console.error('BUILD NOT READY: apps/api/dist does not expose the fixed feed contract.');
    console.error(`Missing export(s): ${missing.join(', ')}`);
    console.error('Rebuild the API (cd apps/api && pnpm build) and re-run: node scripts/verify_feed_fix_local.mjs');
    buildReady = false;
    return;
  }

  const { pollOnce, runPollTick, resolveScoreKeys, readFeedConfig } = scheduler;
  const cfg = readFeedConfig();

  const cfgProblems = [];
  if (!cfg || cfg.enabled !== true) cfgProblems.push('enabled !== true');
  if (!cfg || cfg.apiKey !== 'test-key') cfgProblems.push(`apiKey=${show(cfg && cfg.apiKey)}`);
  if (!cfg || !Array.isArray(cfg.sportKeys) || cfg.sportKeys.length !== 1 || cfg.sportKeys[0] !== 'soccer_epl') {
    cfgProblems.push(`sportKeys=${show(cfg && cfg.sportKeys)}`);
  }
  if (!cfg || Number(cfg.intervalMin) !== 240) cfgProblems.push(`intervalMin=${show(cfg && cfg.intervalMin)}`);
  if (cfgProblems.length > 0) {
    console.error('BUILD NOT READY: readFeedConfig() did not reflect the required env knobs.');
    console.error(`Problems: ${cfgProblems.join('; ')}`);
    buildReady = false;
    return;
  }

  const getMatchByExternalId = (externalId) => db.prepare(
    `SELECT id, external_id, kickoff_time, status, home_score, away_score,
            sport, league, source, match_feed_key
       FROM matches WHERE external_id = ?`,
  ).get(externalId);

  const eventId = fake.oddsId;

  // 1. FUTURE_INSERT ---------------------------------------------------------
  await assertion('FUTURE_INSERT', async () => {
    const result = await pollOnce(db, cfg, { pollScores: false });
    assert.equal(result.ok, true, `odds poll failed: ${show(result.detail)}`);

    const match = getMatchByExternalId(eventId);
    assert.ok(match, `match ${eventId} was not inserted (detail=${show(result.detail)})`);
    assert.ok(
      Date.parse(match.kickoff_time) > Date.now(),
      `kickoff_time is not in the future: ${match.kickoff_time}`,
    );

    const markets = db.prepare('SELECT type, status FROM markets WHERE match_id = ? ORDER BY type').all(match.id);
    const openMarkets = markets.filter((market) => market.status === 'open');
    assert.equal(openMarkets.length, 2, `expected 2 open markets, got ${show(markets)}`);
    assert.equal(match.match_feed_key, 'soccer_epl', `match_feed_key was ${show(match.match_feed_key)}`);

    return `kickoff=${match.kickoff_time} openMarkets=${openMarkets.map((m) => m.type).join('+')}`;
  });

  // 2. SCORES_DAYSFROM -------------------------------------------------------
  await assertion('SCORES_DAYSFROM', async () => {
    const callsBefore = fake.getScoreCalls().length;
    const result = await pollOnce(db, cfg, { pollScores: true });
    const calls = fake.getScoreCalls().slice(callsBefore);

    assert.ok(
      calls.length > 0,
      `no /scores request observed (paths=${show(Array.from(fake.getCounts().entries()))})`,
    );
    const withDaysFrom = calls.filter((call) => call.daysFrom != null && call.daysFrom !== '');
    assert.ok(
      withDaysFrom.length > 0,
      `scores request is missing the daysFrom query param (calls=${show(calls)})`,
    );

    const daysFrom = Number(withDaysFrom[0].daysFrom);
    assert.ok(
      Number.isInteger(daysFrom) && daysFrom >= 1 && daysFrom <= 3,
      `daysFrom must be an integer in 1..3, got ${show(withDaysFrom[0].daysFrom)}`,
    );

    const match = getMatchByExternalId(eventId);
    assert.ok(match, `match ${eventId} disappeared before scores ingestion`);
    assert.equal(match.status, 'finished', `status after scores (scores=${show(result.scores)})`);
    assert.equal(match.home_score, 2, 'home_score after scores');
    assert.equal(match.away_score, 1, 'away_score after scores');

    return `daysFrom=${daysFrom} score=${match.home_score}-${match.away_score}`;
  });

  // 3. TERMINAL_STATUS -------------------------------------------------------
  await assertion('TERMINAL_STATUS', async () => {
    const before = getMatchByExternalId(eventId);
    assert.ok(before && before.status === 'finished', `precondition: expected finished, got ${show(before && before.status)}`);

    const result = await pollOnce(db, cfg, { pollScores: false });
    const after = getMatchByExternalId(eventId);
    assert.ok(after, `match ${eventId} disappeared after the second odds poll`);
    assert.equal(
      after.status,
      'finished',
      `finished match regressed after a not-completed odds payload (detail=${show(result.detail)})`,
    );
    assert.equal(after.home_score, 2, 'home_score must be preserved');
    assert.equal(after.away_score, 1, 'away_score must be preserved');

    return `status=${after.status} score=${after.home_score}-${after.away_score}`;
  });

  // 4. QUOTA_PERSISTED -------------------------------------------------------
  await assertion('QUOTA_PERSISTED', async () => {
    const keys = ['feed_quota_remaining', 'feed_quota_used', 'feed_quota_updated_at'];
    const rows = db.prepare(
      `SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(', ')})`,
    ).all(...keys);
    const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

    for (const key of keys) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(map, key),
        `settings.${key} is missing (rows=${show(rows)})`,
      );
    }

    const lastQuota = fake.lastQuota;
    assert.ok(lastQuota, 'fake server did not record a quota header (no successful request?)');
    assert.equal(
      Number(map.feed_quota_remaining),
      lastQuota.remaining,
      `settings.feed_quota_remaining vs last x-requests-remaining (settings=${show(map)})`,
    );
    assert.ok(
      Number.isFinite(Number(map.feed_quota_used)),
      `settings.feed_quota_used is not numeric: ${show(map.feed_quota_used)}`,
    );
    assert.ok(
      String(map.feed_quota_updated_at).length > 0,
      `settings.feed_quota_updated_at is empty: ${show(map.feed_quota_updated_at)}`,
    );

    return `remaining=${map.feed_quota_remaining} (header=${lastQuota.remaining}) used=${map.feed_quota_used} updated_at=${map.feed_quota_updated_at}`;
  });

  // 5. QUOTA_BACKOFF ---------------------------------------------------------
  await assertion('QUOTA_BACKOFF', async () => {
    fake.setQuotaMode(true);
    db.prepare(
      "DELETE FROM settings WHERE key IN ('feed_quota_blocked_until', 'feed_last_error_code')",
    ).run();

    // FEED_SCORES_EVERY=2: runPollTick increments state.tickCount first, so starting
    // at 1 makes the first call tick 2 (2 % 2 === 0) — an odds-only tick. This isolates
    // the quota/backoff behavior required by this assertion (exactly one provider
    // request and one error row per tick); the +scores path is covered by SCORES_DAYSFROM.
    const state = { tickCount: 1, lastBlockedUntil: null, lastPollAt: 0, lastScoresAt: 0 };
    const requestsBefore = fake.getTotalRequests();
    const logsBefore = countFeedLog(db);
    const errorsBefore = countFeedLog(db, 'error');

    await runPollTick(db, cfg, state);

    const requestsAfterFirst = fake.getTotalRequests();
    const logsAfterFirst = countFeedLog(db);
    const errorsAfterFirst = countFeedLog(db, 'error');

    assert.ok(
      requestsAfterFirst > requestsBefore,
      'the first quota-limited tick made no HTTP request (quota mode may not be active)',
    );
    assert.equal(
      errorsAfterFirst - errorsBefore,
      1,
      `first quota-limited tick must write exactly one error feed_log row (requests=${requestsAfterFirst - requestsBefore})`,
    );

    const blocked = db.prepare(
      "SELECT value FROM settings WHERE key = 'feed_quota_blocked_until'",
    ).get();
    assert.ok(
      blocked && String(blocked.value).length > 0,
      `settings.feed_quota_blocked_until was not set (settings=${show(db.prepare("SELECT key, value FROM settings WHERE key LIKE 'feed_%'").all())})`,
    );

    await runPollTick(db, cfg, state);

    const requestsSecond = fake.getTotalRequests();
    const logsSecond = countFeedLog(db);
    const errorsSecond = countFeedLog(db, 'error');

    assert.equal(requestsSecond, requestsAfterFirst, 'a backoff tick must not make any new HTTP request');
    assert.equal(logsSecond, logsAfterFirst, 'a backoff tick must not write any new feed_log row');
    assert.equal(errorsSecond, errorsAfterFirst, 'a backoff tick must not write any new error row');

    return `firstTickRequests=${requestsAfterFirst - requestsBefore} errorRows=${errorsAfterFirst - errorsBefore} blockedUntil=${blocked.value} secondTickDelta=${requestsSecond - requestsAfterFirst}`;
  });

  // 6. SCORE_KEY_WINDOW ------------------------------------------------------
  await assertion('SCORE_KEY_WINDOW', async () => {
    const staleKey = 'soccer_stale_window_test';
    const recentKey = 'soccer_recent_window_test';
    const staleKickoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentKickoff = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const requireFromApi = createRequire(path.join(apiDir, 'package.json'));
    const Database = requireFromApi('better-sqlite3');
    const direct = new Database(dbPath);
    try {
      direct.pragma('busy_timeout = 5000');
      const insert = direct.prepare(
        `INSERT INTO matches
           (home_team, away_team, kickoff_time, status, home_score, away_score,
            external_id, sport, league, match_feed_key, source)
         VALUES (?, ?, ?, 'scheduled', NULL, NULL, ?, 'soccer', ?, ?, 'the-odds-api')`,
      );
      insert.run('Stale Home', 'Stale Away', staleKickoff, 'verify-score-window-stale', 'Stale League', staleKey);
      insert.run('Recent Home', 'Recent Away', recentKickoff, 'verify-score-window-recent', 'Recent League', recentKey);
    } finally {
      direct.close();
    }

    const resolved = resolveScoreKeys(db, cfg, 10);
    const keys = Array.from(resolved || []);
    assert.ok(keys.includes(recentKey), `recent score key ${recentKey} missing (keys=${show(keys)})`);
    assert.ok(!keys.includes(staleKey), `stale score key ${staleKey} must be excluded (keys=${show(keys)})`);

    return `keys=${show(keys)}`;
  });
}

try {
  await main();
} catch (error) {
  if (!error.__assertionName) {
    console.error(`HARNESS ERROR: ${error && error.stack ? error.stack : error}`);
  }
} finally {
  try {
    if (db && typeof db.close === 'function') db.close();
  } catch {
    // best-effort cleanup
  }
  try {
    if (fake) await fake.close();
  } catch {
    // best-effort cleanup
  }
  try {
    if (realFetch) globalThis.fetch = realFetch;
  } catch {
    // best-effort cleanup
  }
  try {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  } catch {
    // best-effort cleanup
  }
}

console.log(`\n${passed}/${TOTAL_ASSERTIONS} assertions passed`);
if (!buildReady || passed !== TOTAL_ASSERTIONS) {
  process.exitCode = 1;
}
