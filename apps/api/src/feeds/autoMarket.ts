// autoMarket.ts — 滚球开盘/关盘自动切换（SPORTBOOK Step 35-38）
// 基于 matches 实际枚举（scheduled/finished/settled）自动切换该 match 全部 markets.status：
//   ① 开盘：kickoff_time 已过且 match 仍 scheduled（滚球中）→ 非 suspended 的市场自动 open；
//   ② 关盘：match 已 finished → 全部市场 closed（停止下注）。
// 不做滚球实时赔率（仍赛前固定赔率）。settings.feed_auto_market 开关（默认开启）。
import type { Database } from "better-sqlite3";

type MarketRow = { id: number; status: string };
type MatchRow = { id: number; status: string; kickoff_time: string };

/** settings.feed_auto_market === 'true' → 启用。undefined（未配置）时默认视为启用（运营默认行为）。 */
export function isAutoMarketEnabled(db: Database): boolean {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'feed_auto_market'")
    .get() as { value: string } | undefined;
  return row?.value !== 'false'; // undefined 或 "true" 均启用，仅显式 "false" 关闭
}

/**
 * 对单个 match 自动切换其全部 markets.status。
 * - match.status === 'scheduled' 且 kickoff_time 已过 → 非 suspended 的市场置 open（人工挂盘保护）
 * - match.status === 'finished' → 全部市场无条件 closed（比赛结束必须停止下注）
 * - 其他状态（settled）不动。
 * 仅记录实际变更（from !== to）。
 */
export function autoSwitchMarkets(
  db: Database,
  matchId: number,
): { switched: number; changes: Array<{ marketId: number; from: string; to: string }> } {
  const match = db
    .prepare("SELECT id, status, kickoff_time FROM matches WHERE id = ?")
    .get(matchId) as MatchRow | undefined;
  if (!match) return { switched: 0, changes: [] };

  const markets = db
    .prepare("SELECT id, status FROM markets WHERE match_id = ?")
    .all(matchId) as MarketRow[];
  if (markets.length === 0) return { switched: 0, changes: [] };

  let target: string | null = null;
  if (match.status === 'scheduled') {
    // Date.parse 容错 ISO 或空格分隔格式
    const kickoffMs = Date.parse(match.kickoff_time);
    if (!Number.isNaN(kickoffMs) && kickoffMs <= Date.now()) {
      target = 'open'; // 滚球中 → 开盘（仅非 suspended）
    }
  } else if (match.status === 'finished') {
    target = 'closed'; // 完场 → 无条件关盘
  }

  if (!target) return { switched: 0, changes: [] };

  const changes: Array<{ marketId: number; from: string; to: string }> = [];
  const update = db.prepare("UPDATE markets SET status = ? WHERE id = ?");

  for (const m of markets) {
    // 开盘时保护人工挂盘（suspended 不被覆盖）；关盘时无条件（包括 suspended）
    if (target === 'open' && m.status === 'suspended') continue;
    if (m.status === target) continue;
    update.run(target, m.id);
    changes.push({ marketId: m.id, from: m.status, to: target });
  }

  return { switched: changes.length, changes };
}

/** 遍历所有 status IN (scheduled, finished) 的 matches 逐个切换，汇总结果。供 scheduler 每轮调用。 */
export function autoSwitchAll(
  db: Database,
): { switched: number; matches: number } {
  const matches = db
    .prepare("SELECT id FROM matches WHERE status IN ('scheduled', 'finished')")
    .all() as { id: number }[];
  let switched = 0;
  let handled = 0;
  for (const m of matches) {
    const r = autoSwitchMarkets(db, m.id);
    if (r.switched > 0) {
      switched += r.switched;
      handled += 1;
    }
  }
  return { switched, matches: handled };
}
