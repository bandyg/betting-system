import db from './db/index.js';

/**
 * Data Analytics 聚合模块（Step 31）
 * 所有指标直接对现有 SQLite 实时聚合（数据量小，不做物化/数仓）。
 * 只读，不写任何表。
 */

export interface DashboardStats {
  totalBetStake: number; // 总投注额（全部 bets.stake 合计）
  totalBets: number; // 总下注数
  totalPayout: number; // 总派彩（transactions type=payout 合计）
  netRevenue: number; // 净收入 = 总投注 - 总派彩
  activeUsers: number; // 活跃用户（有下注的 distinct 用户）
  totalUsers: number; // 总用户数
  totalDeposits: number; // 总充值额（transactions type=deposit 合计）
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD (UTC)
  stake: number; // 当日下注额
  bets: number; // 当日下注数
  payout: number; // 当日派彩额
}

export interface HotMatch {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  stake: number; // 投注额
  bets: number; // 下注数
}

export interface UserAnalytics {
  userId: number;
  name: string;
  stake: number; // 累计投注额
  payout: number; // 累计派彩
  net: number; // 盈亏 = payout - stake
  bets: number; // 下注数
  deposits: number; // 累计充值
}

/** 仪表盘总览 */
export function getDashboard(): DashboardStats {
  const stakeRow = db
    .prepare('SELECT COALESCE(SUM(stake), 0) AS s, COUNT(*) AS n FROM bets')
    .get() as { s: number; n: number };
  const payoutRow = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE type = 'payout'")
    .get() as { s: number };
  const depositRow = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE type = 'deposit'")
    .get() as { s: number };
  const activeRow = db
    .prepare('SELECT COUNT(DISTINCT user_id) AS n FROM bets')
    .get() as { n: number };
  const userRow = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };

  return {
    totalBetStake: Math.round(stakeRow.s * 100) / 100,
    totalBets: stakeRow.n,
    totalPayout: Math.round(payoutRow.s * 100) / 100,
    netRevenue: Math.round((stakeRow.s - payoutRow.s) * 100) / 100,
    activeUsers: activeRow.n,
    totalUsers: userRow.n,
    totalDeposits: Math.round(depositRow.s * 100) / 100,
  };
}

/** 近 N 天按日投注/派彩趋势（UTC 日期） */
export function getTrends(days = 14): TrendPoint[] {
  const n = Math.min(Math.max(Number(days) || 14, 1), 90);
  const stakeRows = db
    .prepare(
      `SELECT date(created_at) AS d, COALESCE(SUM(stake), 0) AS s, COUNT(*) AS n
       FROM bets
       WHERE date(created_at) >= date('now', ?)
       GROUP BY d ORDER BY d`,
    )
    .all(`-${n - 1} days`) as { d: string; s: number; n: number }[];
  const payoutRows = db
    .prepare(
      `SELECT date(created_at) AS d, COALESCE(SUM(amount), 0) AS s
       FROM transactions
       WHERE type = 'payout' AND date(created_at) >= date('now', ?)
       GROUP BY d ORDER BY d`,
    )
    .all(`-${n - 1} days`) as { d: string; s: number }[];

  const stakeMap = new Map(stakeRows.map((r) => [r.d, r]));
  const payoutMap = new Map(payoutRows.map((r) => [r.d, r.s]));

  // 生成连续日期序列，缺数据补 0
  const out: TrendPoint[] = [];
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (n - 1));
  start.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    const key = day.toISOString().slice(0, 10);
    const st = stakeMap.get(key);
    out.push({
      date: key,
      stake: Math.round((st?.s ?? 0) * 100) / 100,
      bets: st?.n ?? 0,
      payout: Math.round((payoutMap.get(key) ?? 0) * 100) / 100,
    });
  }
  return out;
}

/** 热门赛事 Top N（按下注额） */
export function getHotMatches(limit = 10): HotMatch[] {
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const rows = db
    .prepare(
      `SELECT m.id AS matchId, m.home_team AS homeTeam, m.away_team AS awayTeam,
              COALESCE(SUM(b.stake), 0) AS stake, COUNT(b.id) AS bets
       FROM matches m
       LEFT JOIN markets mk ON mk.match_id = m.id
       LEFT JOIN bets b ON b.market_id = mk.id
       GROUP BY m.id
       ORDER BY stake DESC
       LIMIT ?`,
    )
    .all(n) as { matchId: number; homeTeam: string; awayTeam: string; stake: number; bets: number }[];
  return rows.map((r) => ({ ...r, stake: Math.round(r.stake * 100) / 100 }));
}

/** 用户画像 Top N（按盈亏/充值/投注统计） */
export function getUserAnalytics(limit = 10): UserAnalytics[] {
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const rows = db
    .prepare(
      `SELECT u.id AS userId, u.name,
              COALESCE(SUM(b.stake), 0) AS stake,
              COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.potential_payout ELSE 0 END), 0) AS wonPayout,
              COUNT(b.id) AS bets
       FROM users u
       LEFT JOIN bets b ON b.user_id = u.id
       GROUP BY u.id
       ORDER BY stake DESC
       LIMIT ?`,
    )
    .all(n) as { userId: number; name: string; stake: number; wonPayout: number; bets: number }[];

  // 实际派彩：transactions type=payout 按账户 → 用户聚合
  const payouts = db
    .prepare(
      `SELECT u.id AS userId, COALESCE(SUM(t.amount), 0) AS payout
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN users u ON u.id = a.user_id
       WHERE t.type = 'payout'
       GROUP BY u.id`,
    )
    .all() as { userId: number; payout: number }[];
  const payoutMap = new Map(payouts.map((r) => [r.userId, r.payout]));

  const deposits = db
    .prepare(
      `SELECT u.id AS userId, COALESCE(SUM(t.amount), 0) AS deposits
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       JOIN users u ON u.id = a.user_id
       WHERE t.type = 'deposit'
       GROUP BY u.id`,
    )
    .all() as { userId: number; deposits: number }[];
  const depositMap = new Map(deposits.map((r) => [r.userId, r.deposits]));

  return rows.map((r) => {
    const payout = Math.round((payoutMap.get(r.userId) ?? r.wonPayout) * 100) / 100;
    const stake = Math.round(r.stake * 100) / 100;
    return {
      userId: r.userId,
      name: r.name,
      stake,
      payout,
      net: Math.round((payout - stake) * 100) / 100,
      bets: r.bets,
      deposits: Math.round((depositMap.get(r.userId) ?? 0) * 100) / 100,
    };
  });
}