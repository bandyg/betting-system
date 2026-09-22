// backfill_feed_keys.mjs (feed-scores-fix) — 一次性回填：sport+league → the-odds-api sport key。
// 用法（repo root / apps/api 均可，DB 路徑必傳）：
//   node apps/api/scripts/backfill_feed_keys.mjs data/betting.db            # dry-run（預設只印不寫）
//   node apps/api/scripts/backfill_feed_keys.mjs data/betting.db --write    # 實際回填
// 冪等：只更新 match_feed_key IS NULL 且 status='scheduled' 的列；重跑安全。
// 只回填 kickoff 在可結算窗口內的場次（近 3 天已開賽 + 未來 7 天），避免動整庫 3.8k 列。
import Database from 'better-sqlite3';

const REVERSE_MAP = [
  ['soccer', 'EPL', 'soccer_epl'],
  ['soccer', 'Champions League', 'soccer_uefa_champs_league'],
  ['soccer', 'La Liga', 'soccer_spain_la_liga'],
  ['soccer', 'Bundesliga', 'soccer_germany_bundesliga'],
  ['soccer', 'Serie A', 'soccer_italy_serie_a'],
  ['soccer', 'Ligue 1', 'soccer_france_ligue_one'],
  ['soccer', 'CSL', 'soccer_china_superleague'],
  ['soccer', 'MLS', 'soccer_usa_mls'],
  ['soccer', 'J.League', 'soccer_japan_j_league'],
  ['soccer', 'K League 1', 'soccer_korea_kleague1'],
  ['soccer', 'Eredivisie', 'soccer_netherlands_eredivisie'],
  ['soccer', 'Primeira Liga', 'soccer_portugal_primeira_liga'],
  ['basketball', 'NBA', 'basketball_nba'],
  ['basketball', 'NCAAB', 'basketball_ncaab'],
  ['basketball', 'Euroleague', 'basketball_euroleague'],
  ['basketball', 'WNBA', 'basketball_wnba'],
  ['tennis', 'ATP', 'tennis_atp'],
  ['tennis', 'WTA', 'tennis_wta'],
  ['baseball', 'MLB', 'baseball_mlb'],
  ['baseball', 'KBO', 'baseball_kbo'],
  ['baseball', 'NPB', 'baseball_npb'],
  ['icehockey', 'NHL', 'icehockey_nhl'],
  ['mma', 'UFC', 'mma_mixed_martial_arts'],
  ['boxing', 'Boxing', 'boxing_boxing'],
  ['football', 'NFL', 'americanfootball_nfl'],
  ['football', 'NCAAF', 'americanfootball_ncaaf'],
];

const [dbPath, ...args] = process.argv.slice(2);
if (!dbPath) {
  console.error('usage: node backfill_feed_keys.mjs <db-path> [--write]');
  process.exit(2);
}
const write = args.includes('--write');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// 防禦：未遷移的舊庫直接跑（沒經過 API 啟動 migrate）時自補欄位（冪等，與 migrate() 同邏輯）
const cols = db.prepare('PRAGMA table_info(matches)').all().map((c) => c.name);
if (!cols.includes('match_feed_key')) {
  db.exec('ALTER TABLE matches ADD COLUMN match_feed_key TEXT');
  console.log('added missing column matches.match_feed_key');
}

const setKey = db.prepare(
  `UPDATE matches SET match_feed_key = ?
   WHERE sport = ? AND league = ? AND match_feed_key IS NULL AND status = 'scheduled'
     AND kickoff_time >= datetime('now', '-3 days') AND kickoff_time <= datetime('now', '+7 days')`,
);

const counts = db.prepare(
  `SELECT sport, league, COUNT(*) n FROM matches
   WHERE match_feed_key IS NULL AND status = 'scheduled' GROUP BY sport, league ORDER BY n DESC`,
).all();

console.log(`backfill_feed_keys: db=${dbPath} mode=${write ? 'WRITE' : 'DRY-RUN'}`);
let total = 0;
const countBy = db.prepare(
  `SELECT COUNT(*) n FROM matches
   WHERE sport = ? AND league = ? AND match_feed_key IS NULL AND status = 'scheduled'
     AND kickoff_time >= datetime('now', '-3 days') AND kickoff_time <= datetime('now', '+7 days')`,
);
if (write) {
  const run = db.transaction(() => {
    for (const [sport, league, key] of REVERSE_MAP) {
      const r = setKey.run(key, sport, league);
      if (r.changes > 0) {
        console.log(`  ${sport}/${league} → ${key}: ${r.changes} rows`);
        total += r.changes;
      }
    }
  });
  run();
} else {
  for (const [sport, league, key] of REVERSE_MAP) {
    const n = countBy.get(sport, league).n;
    if (n > 0) {
      console.log(`  ${sport}/${league} → ${key}: ${n} rows (would update)`);
      total += n;
    }
  }
}
console.log(`total backfilled: ${total} rows${write ? '' : ' (dry-run, re-run with --write to apply)'}`);

const remain = db.prepare(
  "SELECT COUNT(*) n FROM matches WHERE match_feed_key IS NULL AND status = 'scheduled' AND kickoff_time >= datetime('now', '-3 days') AND kickoff_time <= datetime('now', '+7 days')",
).get();
console.log(`remaining in settle-window without key: ${remain.n}`);
db.close();
