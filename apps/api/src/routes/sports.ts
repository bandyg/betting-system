import { Router } from 'express';
import db from '../db/index.js';

export const sportsRouter = Router();

type SportGroup = {
  sport: string;
  leagues: Array<{ league: string; count: number }>;
};

/** 与玩家端大厅口径一致的可浏览窗口：默认只数 scheduled 且开赛时间 >= now-3h 的赛事，
 *  保证分类 chip 上的数字 = 「日期=全部」时该分类下能看到的场次数。 */
function browsableWhere(req: {
  query: Record<string, unknown>;
}): { where: string; params: unknown[] } {
  const status = typeof req.query.status === 'string' && req.query.status.trim() ? req.query.status.trim() : 'scheduled';
  let where = ' WHERE sport IS NOT NULL AND status = ?';
  const params: unknown[] = [status];
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  if (from !== undefined && !Number.isNaN(Date.parse(from))) {
    where += ' AND datetime(kickoff_time) >= datetime(?)';
    params.push(from);
  }
  if (to !== undefined && !Number.isNaN(Date.parse(to))) {
    where += ' AND datetime(kickoff_time) <= datetime(?)';
    params.push(to);
  }
  return { where, params };
}

// GET /sports?status=scheduled&from=&to= — list sports with league counts（口径与 GET /matches 对齐）
sportsRouter.get('/sports', (req, res) => {
  const { where, params } = browsableWhere(req);
  const rows = db
    .prepare(
      `SELECT sport, league, COUNT(*) as count
       FROM matches${where}
       GROUP BY sport, league
       ORDER BY sport, count DESC`,
    )
    .all(...params) as Array<{ sport: string; league: string; count: number }>;

  // Group by sport
  const map = new Map<string, { sport: string; leagues: Array<{ league: string; count: number }> }>();
  for (const row of rows) {
    if (!map.has(row.sport)) {
      map.set(row.sport, { sport: row.sport, leagues: [] });
    }
    map.get(row.sport)!.leagues.push({ league: row.league, count: row.count });
  }

  // Also include manual matches (sport=null) as "other"
  const manualRows = db
    .prepare(`SELECT COUNT(*) as n FROM matches WHERE sport IS NULL AND status = ?`)
    .get(params[0]) as { n: number };
  if (manualRows.n > 0) {
    map.set('other', { sport: 'other', leagues: [{ league: 'Manual', count: manualRows.n }] });
  }

  res.json({ sports: Array.from(map.values()) });
});

// GET /leagues?sport=soccer&status=scheduled&from=&to= — list leagues for a sport（同一口径）
sportsRouter.get('/leagues', (req, res) => {
  const sport = req.query.sport as string | undefined;
  const { where, params } = browsableWhere(req);
  let rows: Array<{ league: string; count: number }>;

  if (sport) {
    rows = db
      .prepare(
        `SELECT league, COUNT(*) as count
         FROM matches${where.replace('sport IS NOT NULL', 'sport = ?')}
         GROUP BY league
         ORDER BY count DESC`,
      )
      .all(sport, ...params.slice(1)) as Array<{ league: string; count: number }>;
  } else {
    rows = db
      .prepare(
        `SELECT sport || ':' || league as league, COUNT(*) as count
         FROM matches${where}
         GROUP BY sport, league
         ORDER BY count DESC`,
      )
      .all(...params) as Array<{ league: string; count: number }>;
  }

  res.json({ sport: sport ?? null, leagues: rows });
});
