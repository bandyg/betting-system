import db from './db/index.js';

export interface RiskLimits {
  id: number;
  min_stake: number;
  max_stake: number;
  min_odds: number;
  max_odds: number;
  max_daily_stake: number;
  updated_at: string;
}

/** 读取风控限额单行配置（id 恒为 1） */
export function getRiskLimits(): RiskLimits {
  return db.prepare('SELECT * FROM risk_limits WHERE id = 1').get() as RiskLimits;
}

/**
 * 风控校验：单笔 stake 上/下限 + 赔率合法范围 + 用户日累计 stake 上限。
 * 返回 null 表示通过；否则返回错误信息（由调用方以 400 返回）。
 * 注意：日累计按 UTC 日（与全库 datetime('now') 一致）统计。
 */
export function checkRisk(opts: { stake: number; price: number; userId: number }): string | null {
  const limits = getRiskLimits();

  if (opts.stake < limits.min_stake) {
    return `stake ${opts.stake} 低于单笔下限 ${limits.min_stake}`;
  }
  if (opts.stake > limits.max_stake) {
    return `stake ${opts.stake} 超过单笔上限 ${limits.max_stake}`;
  }
  if (opts.price < limits.min_odds || opts.price > limits.max_odds) {
    return `赔率 ${opts.price} 超出合法范围 [${limits.min_odds}, ${limits.max_odds}]`;
  }

  const row = db
    .prepare(
      `SELECT COALESCE(SUM(stake), 0) AS total
       FROM bets WHERE user_id = ? AND created_at >= date('now')`,
    )
    .get(opts.userId) as { total: number };
  if (row.total + opts.stake > limits.max_daily_stake) {
    return `日累计 stake ${row.total + opts.stake} 超过上限 ${limits.max_daily_stake}`;
  }

  return null;
}
