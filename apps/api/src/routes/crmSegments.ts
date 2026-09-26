// crmSegments.ts routes — admin segments + campaigns + user notifications 收件箱

import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';
import { evaluateSegment, runCampaign, type Campaign } from '../crmSegments.js';

export const crmAdminRouter = Router();

// ─── Segments CRUD + 评估预览 ───

crmAdminRouter.get('/admin/crm/segments', requireAuth, requireRole('admin'), (_req, res) => {
  const rows = db.prepare('SELECT * FROM crm_segments ORDER BY id ASC').all();
  res.json({ segments: rows });
});

crmAdminRouter.post('/admin/crm/segments', requireAuth, requireRole('admin'), (req, res) => {
  const { slug, name, description = '', rules = {}, enabled = 1 } = req.body ?? {};
  const me = res.locals.user as { id: number };
  if (typeof slug !== 'string' || !slug.trim()) return res.status(400).json({ error: 'slug required' });
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
  if (typeof rules !== 'object' || rules === null) return res.status(400).json({ error: 'rules must be an object' });
  try {
    const r = db.prepare(
      'INSERT INTO crm_segments (slug, name, description, rules_json, enabled, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(slug.trim(), name.trim(), description, JSON.stringify(rules), enabled ? 1 : 0, me.id);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: `slug 已存在：${(e as Error).message}` });
  }
});

crmAdminRouter.put('/admin/crm/segments/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM crm_segments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'segment 不存在' });
  const { name, description, rules, enabled } = req.body ?? {};
  const next = {
    name: typeof name === 'string' ? name.trim() : existing.name,
    description: typeof description === 'string' ? description : existing.description,
    rules_json: rules ? JSON.stringify(rules) : existing.rules_json,
    enabled: enabled === undefined ? existing.enabled : (enabled ? 1 : 0),
  };
  db.prepare('UPDATE crm_segments SET name=?, description=?, rules_json=?, enabled=?, updated_at=datetime("now") WHERE id=?').run(
    next.name, next.description, next.rules_json, next.enabled, id
  );
  res.json({ ok: true });
});

crmAdminRouter.delete('/admin/crm/segments/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM crm_segments WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'segment 不存在' });
  res.json({ ok: true });
});

// 预览：评估当前 rules，返回匹配 user 数 + sample ids
crmAdminRouter.post('/admin/crm/segments/:id/preview', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const seg = db.prepare('SELECT * FROM crm_segments WHERE id = ?').get(id) as { rules_json: string } | undefined;
  if (!seg) return res.status(404).json({ error: 'segment 不存在' });
  let rules: Record<string, unknown> = {};
  try { rules = JSON.parse(seg.rules_json); } catch { return res.status(400).json({ error: 'rules_json 非法' }); }
  // 也支持 body.rules 临时覆盖
  const useRules = (req.body?.rules ?? rules) as Parameters<typeof evaluateSegment>[1];
  const ids = evaluateSegment(db, useRules);
  const sample = ids.slice(0, 10).map((uid) => {
    const u = db.prepare('SELECT id, name, role, vip_tier FROM users WHERE id = ?').get(uid) as { name: string; vip_tier: string };
    return u;
  });
  res.json({ count: ids.length, sample });
});

// ─── Campaigns CRUD + 手动执行 ───

crmAdminRouter.get('/admin/crm/campaigns', requireAuth, requireRole('admin'), (_req, res) => {
  const rows = db.prepare(
    `SELECT c.*, s.name AS segment_name, s.slug AS segment_slug
     FROM crm_campaigns c JOIN crm_segments s ON s.id = c.segment_id
     ORDER BY c.id ASC`
  ).all();
  res.json({ campaigns: rows });
});

crmAdminRouter.post('/admin/crm/campaigns', requireAuth, requireRole('admin'), (req, res) => {
  const {
    segment_id, name, action_type, action_payload = {},
    trigger_type = 'manual', cron_expr = null,
    max_executions = 0, cooldown_days = 7, enabled = 1,
  } = req.body ?? {};
  const me = res.locals.user as { id: number };
  if (!Number.isInteger(segment_id)) return res.status(400).json({ error: 'segment_id (integer) required' });
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
  if (!['promotion_code', 'site_message', 'bonus_credit'].includes(action_type)) return res.status(400).json({ error: 'action_type invalid' });
  if (!['manual', 'cron'].includes(trigger_type)) return res.status(400).json({ error: 'trigger_type invalid' });
  const segExists = db.prepare('SELECT id FROM crm_segments WHERE id = ?').get(segment_id);
  if (!segExists) return res.status(400).json({ error: 'segment_id 不存在' });
  try {
    const r = db.prepare(
      `INSERT INTO crm_campaigns (segment_id, name, action_type, action_payload_json, trigger_type, cron_expr, max_executions, cooldown_days, enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(segment_id, name.trim(), action_type, JSON.stringify(action_payload), trigger_type, cron_expr, max_executions, cooldown_days, enabled ? 1 : 0, me.id);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});

crmAdminRouter.put('/admin/crm/campaigns/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM crm_campaigns WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'campaign 不存在' });
  const { name, action_payload, trigger_type, cron_expr, max_executions, cooldown_days, enabled } = req.body ?? {};
  const next = {
    name: typeof name === 'string' ? name.trim() : existing.name,
    action_payload_json: action_payload ? JSON.stringify(action_payload) : existing.action_payload_json,
    trigger_type: trigger_type ?? existing.trigger_type,
    cron_expr: cron_expr === undefined ? existing.cron_expr : cron_expr,
    max_executions: max_executions ?? existing.max_executions,
    cooldown_days: cooldown_days ?? existing.cooldown_days,
    enabled: enabled === undefined ? existing.enabled : (enabled ? 1 : 0),
  };
  db.prepare(
    `UPDATE crm_campaigns SET name=?, action_payload_json=?, trigger_type=?, cron_expr=?, max_executions=?, cooldown_days=?, enabled=?, updated_at=datetime("now") WHERE id=?`
  ).run(next.name, next.action_payload_json, next.trigger_type, next.cron_expr, next.max_executions, next.cooldown_days, next.enabled, id);
  res.json({ ok: true });
});

crmAdminRouter.delete('/admin/crm/campaigns/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM crm_campaigns WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'campaign 不存在' });
  res.json({ ok: true });
});

// 手动执行：评估 segment 拿 user_ids → runCampaign
crmAdminRouter.post('/admin/crm/campaigns/:id/run', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const camp = db.prepare('SELECT * FROM crm_campaigns WHERE id = ?').get(id) as Campaign | undefined;
  if (!camp) return res.status(404).json({ error: 'campaign 不存在' });
  const seg = db.prepare('SELECT rules_json FROM crm_segments WHERE id = ?').get(camp.segment_id) as { rules_json: string } | undefined;
  if (!seg) return res.status(400).json({ error: '关联 segment 不存在' });
  let rules: Parameters<typeof evaluateSegment>[1] = {};
  try { rules = JSON.parse(seg.rules_json); } catch { return res.status(400).json({ error: 'rules_json 非法' }); }
  const ids = evaluateSegment(db, rules);
  const result = runCampaign(db, camp, ids);
  res.json({ matched: ids.length, ...result });
});

// ─── User notifications（用户自助收件箱 + admin 看）───

crmAdminRouter.get('/admin/crm/executions', requireAuth, requireRole('admin'), (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const rows = db.prepare(
    `SELECT e.*, c.name AS campaign_name, u.name AS user_name
     FROM crm_campaign_executions e
     JOIN crm_campaigns c ON c.id = e.campaign_id
     JOIN users u ON u.id = e.user_id
     ORDER BY e.created_at DESC LIMIT ?`
  ).all(limit);
  res.json({ executions: rows });
});