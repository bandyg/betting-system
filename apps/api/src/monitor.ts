// monitor.ts (R9 监控 / 告警) — 零外部依赖（Node http + 标准库）的轻量告警器。
//
// 设计原则：
//   1. env-gated：所有功能默认关闭，需 ALERT_WEBHOOK_URL 才启用（生产 secrets 走 ~/.betting-feed.env 同款机制）
//   2. 去抖动：同 (category, key) 5 分钟内只发 1 次，避免风暴（feed 断链 1 个月期间不重发 4000 条）
//   3. 阈值告警：5xx rate > 1% 或 feed_log 错误数 >= N 才告警；纯 4xx 不告警
//   4. 失败隔离：webhook 投递失败绝不影响主请求（try/catch 包死）
//   5. 健康快照：collectMetrics() 让 health.ts 直接拉（feed_log 错误数 / open bets / DB size）
//
// Webhook 格式（兼容 Feishu / Slack / Discord 通用）：
//   POST { "text": "...", "attachments": [...] } 或 Feishu 自定义机器人 { "msg_type":"text","content":{...} }
//   脚本默认发 Slack-兼容 { text }，Feishu 用 ALERT_WEBHOOK_FORMAT=feishu 切换。
//
// 用法（在 index.ts 启动后挂中间件）：
//   import { monitorMiddleware, alertOnFeedLogErrors, startMonitorTick } from './monitor.js';
//   app.use(monitorMiddleware);
//   startMonitorTick(db);  // 后台每分钟扫一次 feed_log 错误

import http from 'node:http';
import { URL } from 'node:url';
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

// ---------- 配置（env 全部默认关闭；运行时读取以支持测试时动态配置） ----------

function envStr(key: string, def: string): string {
  return process.env[key] ?? def;
}
function envNum(key: string, def: number): number {
  const v = process.env[key];
  return v === undefined || v === '' ? def : Number(v) || def;
}
// env 在每次 fireAlert 调用时读，让测试可在 import 之后改 env；生产启动后稳定不变
const getWebhookUrl = () => envStr('ALERT_WEBHOOK_URL', '');
const getWebhookFormat = () => envStr('ALERT_WEBHOOK_FORMAT', 'slack') as 'slack' | 'feishu';
const getDedupeMs = () => envNum('ALERT_DEDUPE_MS', 300000);
const get5xxRateThreshold = () => envNum('ALERT_5XX_RATE_THRESHOLD', 0.01);
const get5xxMinSamples = () => envNum('ALERT_5XX_MIN_SAMPLES', 50);
const getFeedLogErrThreshold = () => envNum('ALERT_FEED_LOG_ERR_THRESHOLD', 5);
const getTickIntervalMin = () => envNum('ALERT_TICK_INTERVAL_MIN', 15);
const getServiceName = () => envStr('SERVICE_NAME', 'betting-api');

interface AlertPayload {
  category: 'http_5xx_rate' | 'feed_log_errors' | 'unhandled_exception' | 'db_size';
  key: string;
  message: string;
  severity: 'warning' | 'critical';
  meta?: Record<string, unknown>;
}

// ---------- 去抖动内存表 ----------

const lastSent = new Map<string, number>(); // key → ts(ms)

function shouldSend(key: string): boolean {
  const now = Date.now();
  const prev = lastSent.get(key) ?? 0;
  if (now - prev < getDedupeMs()) return false;
  lastSent.set(key, now);
  return true;
}

// 单元测试可清
export function _resetDedup(): void { lastSent.clear(); }

// ---------- Webhook 投递（异步 + 失败隔离） ----------

function buildBody(p: AlertPayload): string {
  if (getWebhookFormat() === 'feishu') {
    return JSON.stringify({
      msg_type: 'text',
      content: { text: `[${getServiceName()}] [${p.severity}] ${p.message}` },
    });
  }
  // Slack 兼容
  return JSON.stringify({
    text: `🚨 [${getServiceName()}] [${p.severity}] ${p.message}`,
    attachments: [
      {
        color: p.severity === 'critical' ? 'danger' : 'warning',
        fields: Object.entries(p.meta ?? {}).map(([k, v]) => ({ title: k, value: String(v), short: true })),
      },
    ],
  });
}

export function fireAlert(p: AlertPayload): void {
  const url = getWebhookUrl();
  if (!url) return; // 未配置 → 静默（本地/CI 不投递）
  if (!shouldSend(p.key)) return;
  try {
    const u = new URL(url);
    const body = buildBody(p);
    const req = http.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 5000,
      },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 400) {
          console.error(`[monitor] webhook ${res.statusCode}`);
        }
      },
    );
    req.on('error', (e) => console.error(`[monitor] webhook failed: ${e.message}`));
    req.on('timeout', () => { req.destroy(); });
    req.write(body);
    req.end();
  } catch (e) {
    console.error(`[monitor] build/send failed: ${(e as Error).message}`);
  }
}

// ---------- HTTP 中间件：5xx rate + unhandled exception ----------

interface RateWindow { ts: number; total: number; err5xx: number }
let window: RateWindow = { ts: Date.now(), total: 0, err5xx: 0 };
const RATE_WINDOW_MS = 60_000; // 1 分钟滑窗

function checkRate(): void {
  const now = Date.now();
  if (now - window.ts < RATE_WINDOW_MS) return;
  const { total, err5xx } = window;
  window = { ts: now, total: 0, err5xx: 0 };
  if (total < get5xxMinSamples()) return;
  const rate = err5xx / total;
  if (rate >= get5xxRateThreshold()) {
    fireAlert({
      category: 'http_5xx_rate',
      key: `5xx_rate_${err5xx}_${total}`,
      severity: 'critical',
      message: `5xx rate ${(rate * 100).toFixed(2)}% (${err5xx}/${total}) over last 60s`,
      meta: { rate: `${(rate * 100).toFixed(2)}%`, err5xx, total, window: '60s' },
    });
  }
}

/** 3 参普通中间件：响应结束统计 5xx rate（挂 requireAuth 之前的全局层） */
export function monitorMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    window.total += 1;
    if (res.statusCode >= 500) window.err5xx += 1;
    checkRate();
  });
  next();
}

/** 4 参错误中间件：捕获 unhandled 异常 → 告警 → 交给 Express 默认处理 */
export function monitorErrorMiddleware(err: Error, req: Request, res: Response, next: NextFunction): void {
  fireAlert({
    category: 'unhandled_exception',
    key: `unhandled_${err.name}_${(err.message || '').slice(0, 60)}`,
    severity: 'critical',
    message: `Unhandled ${err.name}: ${err.message}`,
    meta: { path: req.path, method: req.method, stack: (err.stack ?? '').slice(0, 400) },
  });
  next(err);
}

// ---------- 后台 tick：扫 feed_log + open_bets + DB size ----------

export interface MetricsSnapshot {
  feed_log_errors_24h: number;
  open_bets: number;
  db_size_bytes: number;
  uptime_s: number;
}

const startedAt = Date.now();

export function collectMetrics(db: Database.Database, dbPath?: string): MetricsSnapshot {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  let feed_log_errors_24h = 0;
  let open_bets = 0;
  try {
    feed_log_errors_24h = (db.prepare(
      "SELECT COUNT(*) AS n FROM feed_log WHERE requested_at >= ? AND (status='error' OR errors LIKE '%404%' OR errors LIKE '%UNKNOWN_SPORT%')"
    ).get(cutoff) as { n: number }).n;
    open_bets = (db.prepare("SELECT COUNT(*) AS n FROM bets WHERE status='open'").get() as { n: number }).n;
  } catch {
    // 表/列不存在（pre-migration DB）—— 不告警，避免启动期噪声
  }
  let db_size_bytes = 0;
  if (dbPath) {
    try { db_size_bytes = require('node:fs').statSync(dbPath).size; } catch { /* ignore */ }
  }
  return { feed_log_errors_24h, open_bets, db_size_bytes, uptime_s: Math.floor((Date.now() - startedAt) / 1000) };
}

let tickHandle: NodeJS.Timeout | null = null;

export function startMonitorTick(db: Database.Database, dbPath?: string): () => void {
  if (tickHandle) return () => stopMonitorTick();
  const ms = Math.max(1, getTickIntervalMin()) * 60_000;
  const tick = () => {
    try {
      const m = collectMetrics(db, dbPath);
      const thr = getFeedLogErrThreshold();
      if (m.feed_log_errors_24h >= thr) {
        fireAlert({
          category: 'feed_log_errors',
          key: `feed_log_errs_${m.feed_log_errors_24h}`,
          severity: 'critical',
          message: `feed_log 24h errors=${m.feed_log_errors_24h} >= threshold=${thr} — possible data source outage`,
          meta: { errors_24h: m.feed_log_errors_24h, open_bets: m.open_bets, threshold: thr },
        });
      }
      if (m.db_size_bytes > 500 * 1024 * 1024) {
        fireAlert({
          category: 'db_size',
          key: `db_size_${m.db_size_bytes}`,
          severity: 'warning',
          message: `DB size ${(m.db_size_bytes / 1024 / 1024).toFixed(1)}MB > 500MB — consider backup/vacuum`,
          meta: { db_size_bytes: m.db_size_bytes, open_bets: m.open_bets },
        });
      }
    } catch (e) {
      console.error(`[monitor] tick failed: ${(e as Error).message}`);
    }
  };
  tickHandle = setInterval(tick, ms);
  return stopMonitorTick;
}

export function stopMonitorTick(): void {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}