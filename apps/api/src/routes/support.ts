import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireSupport } from './middleware.js';

export const supportRouter = Router();

const CATEGORIES = ['deposit_withdrawal', 'betting', 'account', 'technical', 'other'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const STATUSES = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'] as const;

/** 状态流合法流转白名单（code 层硬编码） */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'waiting_user', 'resolved', 'closed'],
  in_progress: ['waiting_user', 'resolved', 'closed'],
  waiting_user: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
};

export const SUPPORT_CATEGORIES = CATEGORIES;

interface TicketRow {
  id: number;
  user_id: number;
  category: string;
  subject: string;
  body: string;
  priority: string;
  status: string;
  closed_by: number | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: number;
  ticket_id: number;
  author_user_id: number;
  author_role: 'user' | 'agent';
  content: string;
  created_at: string;
}

function parsePagination(q: { page?: unknown; pageSize?: unknown }) {
  let page = 1;
  let pageSize = 20;
  if (q.page !== undefined) {
    page = Number(q.page);
    if (!Number.isInteger(page) || page <= 0) return null;
  }
  if (q.pageSize !== undefined) {
    pageSize = Number(q.pageSize);
    if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 100) return null;
  }
  return { page, pageSize };
}

function getTicket(id: number): TicketRow | undefined {
  return db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id) as TicketRow | undefined;
}

function getTicketWithUser(id: number) {
  return db
    .prepare(
      `SELECT t.*, u.name AS user_name
       FROM support_tickets t JOIN users u ON u.id = t.user_id
       WHERE t.id = ?`,
    )
    .get(id);
}

function getMessages(ticketId: number): MessageRow[] {
  return db
    .prepare(
      'SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY id ASC',
    )
    .all(ticketId) as MessageRow[];
}

/** 发消息副作用：状态自动流转 + updated_at 刷新；返回新状态 */
function applyReplySideEffect(ticket: TicketRow, authorRole: 'user' | 'agent') {
  let nextStatus = ticket.status;
  if (authorRole === 'user' && ticket.status === 'waiting_user') nextStatus = 'in_progress';
  if (authorRole === 'agent' && ticket.status === 'open') nextStatus = 'in_progress';
  db.prepare(
    "UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(nextStatus, ticket.id);
  return nextStatus;
}

/* ==================== 使用者端（requireAuth） ==================== */

// POST /support/tickets — 建单
supportRouter.post('/support/tickets', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number };
  const { category, subject, body, priority } = req.body ?? {};

  if (typeof subject !== 'string' || subject.trim() === '') {
    return res.status(400).json({ error: 'subject is required' });
  }
  if (typeof body !== 'string' || body.trim() === '') {
    return res.status(400).json({ error: 'body is required' });
  }
  if (typeof category !== 'string' || !(CATEGORIES as readonly string[]).includes(category)) {
    return res.status(400).json({ error: 'invalid category' });
  }
  let pri = 'normal';
  if (priority !== undefined) {
    if (typeof priority !== 'string' || !(PRIORITIES as readonly string[]).includes(priority)) {
      return res.status(400).json({ error: 'invalid priority' });
    }
    pri = priority;
  }

  const create = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO support_tickets (user_id, category, subject, body, priority)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(me.id, category, subject.trim(), body.trim(), pri);
    return Number(info.lastInsertRowid);
  });
  const ticketId = create();
  res.status(201).json({ ticket: getTicket(ticketId) });
});

// GET /support/tickets?status=&category=&page=&pageSize= — 我的工单（分页）
supportRouter.get('/support/tickets', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const { status, category } = req.query;

  const userId = req.query.userId;
  if (userId !== undefined) {
    const parsed = Number(userId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'userId must be a positive integer' });
    }
    if (me.role !== 'admin' && parsed !== me.id) {
      return res.status(403).json({ error: '只能查看自己的工单' });
    }
  }
  if (status !== undefined && !(STATUSES as readonly string[]).includes(String(status))) {
    return res.status(400).json({ error: 'invalid status' });
  }
  if (category !== undefined && !(CATEGORIES as readonly string[]).includes(String(category))) {
    return res.status(400).json({ error: 'invalid category' });
  }
  const pg = parsePagination({ page: req.query.page, pageSize: req.query.pageSize });
  if (!pg) {
    return res.status(400).json({ error: 'page/pageSize must be positive integers (pageSize <= 100)' });
  }

  const where = ['user_id = ?'];
  const params: unknown[] = [me.id];
  if (status !== undefined) {
    where.push('status = ?');
    params.push(String(status));
  }
  if (category !== undefined) {
    where.push('category = ?');
    params.push(String(category));
  }
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM support_tickets WHERE ${where.join(' AND ')}`)
      .get(...params) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT * FROM support_tickets WHERE ${where.join(' AND ')}
       ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pg.pageSize, (pg.page - 1) * pg.pageSize) as TicketRow[];

  res.json({ count: rows.length, total, page: pg.page, pageSize: pg.pageSize, tickets: rows });
});

// GET /support/tickets/:id — 看单 + 訊息
supportRouter.get('/support/tickets/:id', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid ticket id' });
  }
  const ticket = getTicketWithUser(id) as (TicketRow & { user_name: string }) | undefined;
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  if (me.role !== 'admin' && me.role !== 'support' && ticket.user_id !== me.id) {
    return res.status(403).json({ error: '只能查看自己的工单' });
  }
  res.json({ ticket, messages: getMessages(id) });
});

// POST /support/tickets/:id/messages — 使用者回覆
supportRouter.post('/support/tickets/:id/messages', requireAuth, (req, res) => {
  const me = res.locals.user as { id: number; role: string };
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid ticket id' });
  }
  const ticket = getTicket(id);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  if (me.role !== 'admin' && me.role !== 'support' && ticket.user_id !== me.id) {
    return res.status(403).json({ error: '只能回复自己的工单' });
  }
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return res.status(409).json({ error: '工单已完结，无法回复' });
  }
  const content = req.body?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'content is required' });
  }

  const reply = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO support_messages (ticket_id, author_user_id, author_role, content)
         VALUES (?, ?, 'user', ?)`,
      )
      .run(id, me.id, content.trim());
    const messageId = Number(info.lastInsertRowid);
    const nextStatus = applyReplySideEffect(ticket, 'user');
    return { messageId, nextStatus };
  });
  const { messageId, nextStatus } = reply();
  const message = db.prepare('SELECT * FROM support_messages WHERE id = ?').get(messageId) as MessageRow;
  res.status(201).json({ message, ticket: { id, status: nextStatus } });
});

// GET /support/categories — 分類靜態列表（公開）
supportRouter.get('/support/categories', (_req, res) => {
  res.json({
    categories: [
      { key: 'deposit_withdrawal', label: '充值/提现' },
      { key: 'betting', label: '投注/赔率' },
      { key: 'account', label: '账户/登录' },
      { key: 'technical', label: '技术问题' },
      { key: 'other', label: '其他' },
    ],
  });
});

/* ==================== 客服/管理端（requireSupport） ==================== */

// GET /admin/support/tickets?status=&category=&userId=&page=&pageSize= — 所有工單
supportRouter.get('/admin/support/tickets', requireAuth, requireSupport, (req, res) => {
  const { status, category } = req.query;

  if (status !== undefined && !(STATUSES as readonly string[]).includes(String(status))) {
    return res.status(400).json({ error: 'invalid status' });
  }
  if (category !== undefined && !(CATEGORIES as readonly string[]).includes(String(category))) {
    return res.status(400).json({ error: 'invalid category' });
  }
  const userId = req.query.userId;
  if (userId !== undefined) {
    const parsed = Number(userId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'userId must be a positive integer' });
    }
  }
  const pg = parsePagination({ page: req.query.page, pageSize: req.query.pageSize });
  if (!pg) {
    return res.status(400).json({ error: 'page/pageSize must be positive integers (pageSize <= 100)' });
  }

  const where: string[] = [];
  const params: unknown[] = [];
  if (status !== undefined) {
    where.push('t.status = ?');
    params.push(String(status));
  }
  if (category !== undefined) {
    where.push('t.category = ?');
    params.push(String(category));
  }
  if (userId !== undefined) {
    where.push('t.user_id = ?');
    params.push(Number(userId));
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM support_tickets t ${whereSql}`)
      .get(...params) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT t.*, u.name AS user_name
       FROM support_tickets t JOIN users u ON u.id = t.user_id
       ${whereSql}
       ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pg.pageSize, (pg.page - 1) * pg.pageSize) as (TicketRow & { user_name: string })[];

  res.json({ count: rows.length, total, page: pg.page, pageSize: pg.pageSize, tickets: rows });
});

// GET /admin/support/tickets/:id — 任意工單詳情
supportRouter.get('/admin/support/tickets/:id', requireAuth, requireSupport, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid ticket id' });
  }
  const ticket = getTicketWithUser(id) as (TicketRow & { user_name: string }) | undefined;
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  res.json({ ticket, messages: getMessages(id) });
});

// POST /admin/support/tickets/:id/messages — 客服回覆
supportRouter.post('/admin/support/tickets/:id/messages', requireAuth, requireSupport, (req, res) => {
  const me = res.locals.user as { id: number };
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid ticket id' });
  }
  const ticket = getTicket(id);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return res.status(409).json({ error: '工单已完结，无法回复' });
  }
  const content = req.body?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'content is required' });
  }

  const reply = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO support_messages (ticket_id, author_user_id, author_role, content)
         VALUES (?, ?, 'agent', ?)`,
      )
      .run(id, me.id, content.trim());
    const messageId = Number(info.lastInsertRowid);
    const nextStatus = applyReplySideEffect(ticket, 'agent');
    return { messageId, nextStatus };
  });
  const { messageId, nextStatus } = reply();
  const message = db.prepare('SELECT * FROM support_messages WHERE id = ?').get(messageId) as MessageRow;
  res.status(201).json({ message, ticket: { id, status: nextStatus } });
});

// PATCH /admin/support/tickets/:id/status — 改狀態
supportRouter.patch('/admin/support/tickets/:id/status', requireAuth, requireSupport, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid ticket id' });
  }
  const target = req.body?.status;
  if (typeof target !== 'string' || !(STATUSES as readonly string[]).includes(target)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  const ticket = getTicket(id);
  if (!ticket) {
    return res.status(404).json({ error: 'ticket not found' });
  }
  const allowed = STATUS_TRANSITIONS[ticket.status] ?? [];
  if (!allowed.includes(target)) {
    return res.status(409).json({ error: `非法状态流转: ${ticket.status} -> ${target}` });
  }
  const me = res.locals.user as { id: number };
  db.transaction(() => {
    if (target === 'closed') {
      db.prepare(
        "UPDATE support_tickets SET status = 'closed', closed_by = ?, closed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      ).run(me.id, id);
    } else {
      db.prepare(
        "UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(target, id);
    }
  })();
  res.json({ ticket: getTicket(id) });
});
