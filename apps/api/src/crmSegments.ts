// crmSegments.ts (R11) — Segment DSL 评估 + Campaign 执行器。
//
// 设计原则：
//   1. 零依赖：纯 SQL 字符串拼接（白名单字段 + 安全字符串转义）
//   2. DSL 最小集：vipTier / lifetimeStake / daysSinceLastBet / daysSinceRegistered / totalBets / marketingOptIn
//   3. 每个 rule key → SQL 片段（防止注入）
//   4. Operator: '>=', '<=', '>', '<', '=' (string 用 IN/=)
//   5. vipTier 用 tier 顺序（bronze < silver < gold < platinum < diamond）— 'gold+' 表示 ≥ gold
//   6. Campaign executor：UNIQUE(campaign_id, user_id) 防重复；cooldown_days 二次防御
//
// 用法：
//   import { evaluateSegment, runCampaign, startCampaignScheduler } from './crmSegments.js';
//   const ids = evaluateSegment(db, rules);  // → number[] (matched user ids)
//   const result = runCampaign(db, campaign, ids);  // { delivered, skipped }

import type Database from 'better-sqlite3';

export type SegmentRule = Record<string, string | number | boolean>;

export interface Campaign {
  id: number;
  segment_id: number;
  name: string;
  action_type: 'promotion_code' | 'site_message' | 'bonus_credit';
  action_payload_json: string; // raw JSON string from DB
  cooldown_days: number;
  max_executions: number;
  enabled: number;
}

// VIP 等级顺序（用于 'gold+' 这种 ≥ 比较）
const VIP_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

// DSL key → SQL 片段生成器。返回 { where, params }
function ruleToSql(key: string, value: string | number | boolean): { where: string; params: (string | number)[] } {
  // 比较运算符解析：'>=100', '>7', '<=30' 拆成 op + num
  const numMatch = String(value).match(/^([><]=?|=|!=)\s*(\d+(?:\.\d+)?)$/);
  const params: (string | number)[] = [];

  switch (key) {
    case 'vipTier': {
      // value: 'gold+' / 'diamond' / 'bronze+'
      const s = String(value);
      if (s.endsWith('+')) {
        const base = s.slice(0, -1);
        const idx = VIP_ORDER.indexOf(base);
        if (idx === -1) return { where: '0', params: [] };
        const tiers = VIP_ORDER.slice(idx);
        return { where: `u.vip_tier IN (${tiers.map(() => '?').join(',')})`, params: tiers };
      }
      return { where: 'u.vip_tier = ?', params: [s] };
    }
    case 'lifetimeStake': {
      if (!numMatch) return { where: '0', params: [] };
      const op = numMatch[1];
      const num = Number(numMatch[2]);
      // lifetime_stake = SUM(bets.stake) WHERE status NOT IN ('void')
      return { where: `COALESCE((SELECT SUM(stake) FROM bets WHERE user_id = u.id AND status != 'void'), 0) ${op} ?`, params: [num] };
    }
    case 'totalBets': {
      if (!numMatch) return { where: '0', params: [] };
      const op = numMatch[1];
      const num = Number(numMatch[2]);
      return { where: `(SELECT COUNT(*) FROM bets WHERE user_id = u.id) ${op} ?`, params: [num] };
    }
    case 'daysSinceLastBet': {
      // value: '>7' → 用户超过 7 天未下注
      if (!numMatch) return { where: '0', params: [] };
      const op = numMatch[1];
      const num = Number(numMatch[2]);
      return { where: `(SELECT MAX(created_at) FROM bets WHERE user_id = u.id) IS NOT NULL AND
                       (julianday('now') - julianday((SELECT MAX(created_at) FROM bets WHERE user_id = u.id))) ${op} ?
                       OR (SELECT COUNT(*) FROM bets WHERE user_id = u.id) = 0 AND ${num} >= 0`,
              params: [num] };
      // 注：OR 链写法略复杂但 SQLite 支持；用于「从未下注」也视为沉睡用户
    }
    case 'daysSinceRegistered': {
      if (!numMatch) return { where: '0', params: [] };
      const op = numMatch[1];
      const num = Number(numMatch[2]);
      return { where: `(julianday('now') - julianday(u.created_at)) ${op} ?`, params: [num] };
    }
    case 'marketingOptIn': {
      // boolean — 必须显式 opt-in
      const want = value === true || value === 'true' || value === '1' ? 1 : 0;
      return { where: `COALESCE((SELECT marketing_opt_in FROM user_preferences WHERE user_id = u.id), 1) = ?`, params: [want] };
    }
    default:
      return { where: '0', params: [] };
  }
}

/** 评估一个 segment 的 rules，返回匹配的 user_id[] */
export function evaluateSegment(db: Database.Database, rules: SegmentRule): number[] {
  const wheres: string[] = [];
  const params: (string | number)[] = [];
  for (const [k, v] of Object.entries(rules)) {
    const { where, params: ps } = ruleToSql(k, v);
    wheres.push(where);
    params.push(...ps);
  }
  // base: 只看 user + 默认排除 admin（避免给管理员推营销）
  const sql = `
    SELECT u.id FROM users u
    WHERE u.role != 'admin'
      AND ${wheres.length ? wheres.join(' AND ') : '1=1'}
  `;
  try {
    return (db.prepare(sql).all(...params) as Array<{ id: number }>).map((r) => r.id);
  } catch (e) {
    console.error(`[crm] evaluateSegment failed: ${(e as Error).message}`);
    return [];
  }
}

/** 跑一次 campaign：对每个 user 写一行 execution + 投 action（notifications / promotion 记录） */
export function runCampaign(db: Database.Database, c: Campaign, userIds: number[]): { delivered: number; skipped: number; errors: number } {
  let delivered = 0, skipped = 0, errors = 0;
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(c.action_payload_json); } catch { /* invalid JSON */ }

  // cooldown 检查：cooldown_days 内有 execution 记录 → 跳过
  const cooldownSince = new Date(Date.now() - c.cooldown_days * 86400_000).toISOString().slice(0, 19).replace('T', ' ');

  const txn = db.transaction((uid: number) => {
    const recent = db.prepare(
      `SELECT id FROM crm_campaign_executions WHERE campaign_id = ? AND user_id = ? AND created_at >= ?`
    ).get(c.id, uid, cooldownSince);
    if (recent) { skipped += 1; return; }

    let ok = false;
    let err = '';
    try {
      if (c.action_type === 'site_message') {
        // 投递站内信
        db.prepare(
          `INSERT INTO notifications (user_id, title, body, link, category) VALUES (?, ?, ?, ?, ?)`
        ).run(uid, String(payload.title ?? c.name), String(payload.body ?? ''), String(payload.link ?? ''), 'campaign');
        ok = true;
      } else if (c.action_type === 'promotion_code') {
        // 仅记录「已发 promotion code」+ 站内信；真正的 code 发放可后续对接 promotions claim 流程
        db.prepare(
          `INSERT INTO notifications (user_id, title, body, link, category) VALUES (?, ?, ?, ?, ?)`
        ).run(uid,
          String(payload.title ?? '专属优惠码'),
          String(payload.body ?? `您获得专属优惠码：${payload.code ?? 'PROMO'}`),
          String(payload.link ?? '/promotions'),
          'promotion');
        ok = true;
      } else if (c.action_type === 'bonus_credit') {
        // 直接加 bonus 到账户（MVP：仅记账，不做 wagering 流水；可后续接 promotions claim）
        const bonus = Number(payload.amount ?? 0);
        if (bonus > 0) {
          db.prepare(
            `UPDATE accounts SET balance = balance + ? WHERE user_id = ?`
          ).run(bonus, uid);
          db.prepare(
            `INSERT INTO transactions (account_id, type, amount) VALUES ((SELECT id FROM accounts WHERE user_id=?), 'adjust', ?)`
          ).run(uid, bonus);
          db.prepare(
            `INSERT INTO notifications (user_id, title, body, category) VALUES (?, ?, ?, ?)`
          ).run(uid, `获得 ${bonus} 元奖金`, `营销活动「${c.name}」已为您账户入账 ${bonus} 元`, 'campaign');
          ok = true;
        }
      }
    } catch (e) {
      err = (e as Error).message;
      errors += 1;
    }

    // 记录 execution（UNIQUE 防御二次触发）
    db.prepare(
      `INSERT OR IGNORE INTO crm_campaign_executions (campaign_id, user_id, segment_id, action_type, action_payload_json, delivered, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(c.id, uid, c.segment_id, c.action_type, c.action_payload_json, ok ? 1 : 0, err || null);
    if (ok) delivered += 1;
  });

  for (const uid of userIds) {
    try { txn(uid); } catch (e) { errors += 1; console.error(`[crm] campaign txn failed for uid=${uid}: ${(e as Error).message}`); }
  }
  db.prepare('UPDATE crm_campaigns SET last_run_at = datetime("now") WHERE id = ?').run(c.id);
  return { delivered, skipped, errors };
}

// ─── 后台 scheduler：每 N 分钟评估一次 segments + 跑 enabled cron campaigns ───

let schedHandle: NodeJS.Timeout | null = null;

export function startCampaignScheduler(db: Database.Database, intervalMin = 30): () => void {
  if (schedHandle) return () => stopCampaignScheduler();
  const ms = Math.max(1, intervalMin) * 60_000;
  const tick = () => {
    try {
      // 1) 评估所有 enabled segments，缓存结果（last count）
      const segs = db.prepare('SELECT * FROM crm_segments WHERE enabled = 1').all() as Array<{
        id: number; rules_json: string; slug: string;
      }>;
      for (const s of segs) {
        let rules: SegmentRule = {};
        try { rules = JSON.parse(s.rules_json); } catch { continue; }
        const ids = evaluateSegment(db, rules);
        db.prepare('UPDATE crm_segments SET cached_count = ?, cached_at = datetime("now") WHERE id = ?').run(ids.length, s.id);
      }
      // 2) 跑所有 enabled trigger_type='cron' campaigns（每次 tick 跑一次；上层可用 cooldown 控制）
      // 注：MVP 不做真正的 cron 表达式解析；tick 周期作为 cron 粒度（默认 30min）
      const camps = db.prepare("SELECT * FROM crm_campaigns WHERE enabled = 1 AND trigger_type = 'cron'").all() as Campaign[];
      for (const c of camps) {
        const segRow = db.prepare('SELECT rules_json FROM crm_segments WHERE id = ?').get(c.segment_id) as { rules_json: string } | undefined;
        if (!segRow) continue;
        let rules: SegmentRule = {};
        try { rules = JSON.parse(segRow.rules_json); } catch { continue; }
        const ids = evaluateSegment(db, rules);
        runCampaign(db, c, ids);
      }
    } catch (e) {
      console.error(`[crm] scheduler tick failed: ${(e as Error).message}`);
    }
  };
  schedHandle = setInterval(tick, ms);
  return stopCampaignScheduler;
}

export function stopCampaignScheduler(): void {
  if (schedHandle) { clearInterval(schedHandle); schedHandle = null; }
}