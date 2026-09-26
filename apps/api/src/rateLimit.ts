// rateLimit.ts (R7 全局限流) — 零依赖内存态固定窗口限流中间件。
//
// 设计原则：
//   1. env-gated：所有阈值通过 env 调（rate_limit_<scope>_max / _window_ms）；默认合理但不上锁
//   2. 失败开放（fail-open）：任何内部错误 → next() 不阻断主流程（避免限流器 bug 把生产挂掉）
//   3. key 维度可配：'ip'（公开端点用）/ 'user'（需登录端点用，防一人多 IP 滥用）
//   4. 复用 auth.ts 模式：内存 Map 计数 + 窗口过期清理；单进程适用（pm2 cluster 需额外适配）
//   5. 标准 429 + Retry-After + X-RateLimit-* 头（RFC 6585 / draft-ietf-httpapi-ratelimit-headers）
//
// 用法：
//   import { rateLimit } from './rateLimit.js';
//   accountsRouter.post('/users', rateLimit({ scope: 'register', keyBy: 'ip' }), ...);
//   betsRouter.post('/bets', requireAuth, rateLimit({ scope: 'bet', keyBy: 'user' }), ...);
//
// 注意：keyBy='user' 必须在 requireAuth 之后挂（依赖 res.locals.user）。

import type { Request, Response, NextFunction } from 'express';

export type RateLimitKey = 'ip' | 'user';

export interface RateLimitOptions {
  /** 命名空间（独立计数维度），如 'register' / 'bet' / 'withdraw' / 'odds_update' */
  scope: string;
  /** 用 IP 还是 userId 作 key */
  keyBy: RateLimitKey;
  /** 窗口内最大请求数（env 可覆盖 RATE_LIMIT_<SCOPE>_MAX） */
  max?: number;
  /** 窗口毫秒（env 可覆盖 RATE_LIMIT_<SCOPE>_WINDOW_MS） */
  windowMs?: number;
}

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

// 单元测试可清
export function _resetBuckets(): void { buckets.clear(); }

// ---------- env 解析 ----------

function envNum(key: string, def: number): number {
  const v = process.env[key];
  return v === undefined || v === '' ? def : Number(v) || def;
}

function resolveLimits(scope: string, fallbackMax: number, fallbackWindowMs: number): { max: number; windowMs: number } {
  const max = envNum(`RATE_LIMIT_${scope.toUpperCase()}_MAX`, fallbackMax);
  const windowMs = envNum(`RATE_LIMIT_${scope.toUpperCase()}_WINDOW_MS`, fallbackWindowMs);
  return { max, windowMs };
}

function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// ---------- 工厂 ----------

export function rateLimit(opts: RateLimitOptions) {
  const { scope, keyBy } = opts;
  // 各 scope 默认值
  const defaults: Record<string, { max: number; windowMs: number }> = {
    register: { max: 5, windowMs: 60_000 },     // 注册：5/min/IP（防刷号）
    bet: { max: 30, windowMs: 60_000 },          // 下注：30/min/user（防脚本）
    withdraw: { max: 10, windowMs: 60_000 },     // 提现：10/min/user
    odds_update: { max: 60, windowMs: 60_000 },  // admin 改赔：60/min/user
  };
  const fallback = defaults[scope] ?? { max: 30, windowMs: 60_000 };

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { max, windowMs } = resolveLimits(scope, fallback.max, fallback.windowMs);
      let key: string | null = null;
      if (keyBy === 'ip') {
        key = `${scope}:ip:${clientKey(req)}`;
      } else {
        const u = res.locals.user as { id?: number } | undefined;
        if (!u?.id) { next(); return; } // requireAuth 未通过时不限流（让上层 401/403 处理）
        key = `${scope}:user:${u.id}`;
      }
      const now = Date.now();
      let b = buckets.get(key);
      if (!b || now >= b.resetAt) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
      }
      b.count += 1;
      const remaining = Math.max(0, max - b.count);
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(b.resetAt / 1000)));
      if (b.count > max) {
        const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({ error: `请求过于频繁，${retryAfter}s 后重试`, scope, retryAfter });
        return;
      }
      next();
    } catch (err) {
      // fail-open：限流器本身出错不应阻断主请求
      console.error(`[rateLimit] ${scope} failed: ${(err as Error).message}`);
      next();
    }
  };
}

// ---------- 懒清理（避免 Map 无限增长）----------

let cleanupHandle: NodeJS.Timeout | null = null;
export function startRateLimitCleanup(intervalMs = 5 * 60_000): () => void {
  if (cleanupHandle) return () => stopRateLimitCleanup();
  cleanupHandle = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }, intervalMs);
  return stopRateLimitCleanup;
}
export function stopRateLimitCleanup(): void {
  if (cleanupHandle) { clearInterval(cleanupHandle); cleanupHandle = null; }
}