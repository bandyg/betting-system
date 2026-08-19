// feed.ts (P3) — admin 数据源管理：状态 / 手动模式切换 / 立即拉取。
// P4：比分入库 + 自动派彩开关（feed_auto_settle）。
import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';
import { pollOnce, readFeedConfig } from '../feeds/scheduler.js';
import { isAutoSettleEnabled } from '../feeds/ingest.js';

export const feedRouter = Router();

type FeedLogRow = {
  id: number;
  provider: string | null;
  requested_at: string;
  status: string | null;
  matches_seen: number | null;
  matches_upserted: number | null;
  errors: string | null;
};

// GET /admin/feed/status — feed 数据源整体状态
feedRouter.get('/admin/feed/status', requireAuth, requireRole('admin'), (_req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'feed_manual'").get() as
    | { value: string }
    | undefined;
  const manual = row?.value === 'true';
  const autoSettle = isAutoSettleEnabled(db);
  const lastLog = db.prepare('SELECT * FROM feed_log ORDER BY id DESC LIMIT 1').get() as
    | FeedLogRow
    | undefined;
  const cfg = readFeedConfig();

  let health: 'ok' | 'error' | 'disabled';
  if (!cfg.apiKey) {
    health = 'disabled';
  } else if (lastLog?.status === 'error') {
    health = 'error';
  } else {
    health = 'ok';
  }

  const feedLog = db
    .prepare(
      'SELECT id, provider, requested_at, status, matches_seen, matches_upserted, errors FROM feed_log ORDER BY id DESC LIMIT 5',
    )
    .all() as FeedLogRow[];
  const count = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE source <> 'manual'").get() as { n: number };

  res.json({
    manual,
    autoSettle,
    lastSync: lastLog?.requested_at ?? null,
    lastProvider: lastLog?.provider ?? null,
    health,
    lastError: lastLog?.status === 'error' ? lastLog.errors : null,
    feedMatchCount: count.n,
    feedLog,
  });
});

// POST /admin/feed/toggle — 手动/自动模式切换（写 settings，scheduler 每轮读取，无需重启）
feedRouter.post('/admin/feed/toggle', requireAuth, requireRole('admin'), (req, res) => {
  const { manual } = req.body ?? {};
  if (typeof manual !== 'boolean') {
    return res.status(400).json({ error: 'manual must be a boolean' });
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('feed_manual', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(manual ? 'true' : 'false');
  res.json({ manual });
});

// POST /admin/feed/auto-settle — 自动派彩开关（写 settings，下次 pollOnce 生效，无需重启）
feedRouter.post('/admin/feed/auto-settle', requireAuth, requireRole('admin'), (req, res) => {
  const { auto } = req.body ?? {};
  if (typeof auto !== 'boolean') {
    return res.status(400).json({ error: 'auto must be a boolean' });
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('feed_auto_settle', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(auto ? 'true' : 'false');
  res.json({ auto });
});

// POST /admin/feed/ingest — 立即拉取一次（主动操作，不受 manual 模式限制）
feedRouter.post('/admin/feed/ingest', requireAuth, requireRole('admin'), async (_req, res) => {
  const cfg = readFeedConfig();
  if (!cfg.apiKey) {
    return res.status(400).json({ error: 'FEED_API_KEY not set' });
  }
  const r = await pollOnce(db, cfg);
  res.json({ ok: r.ok, detail: r.detail, scores: r.scores ?? null });
});