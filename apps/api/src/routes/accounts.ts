import { Router } from 'express';
import db, { hashPassword, DEFAULT_PASSWORD } from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';
import { signSessionToken } from '../jwt.js';

export const accountsRouter = Router();

// POST /users — create user + account (balance 0)，password 可选（默认 123456，demo）
// 公开注册端点（也用于 admin 面板新建用户，注册后即返回可用的 session token）
accountsRouter.post('/users', (req, res) => {
  const { name, password } = req.body ?? {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required (non-empty string)' });
  }
  const trimmed = name.trim();
  const pw = typeof password === 'string' && password.length > 0 ? password : DEFAULT_PASSWORD;
  const existing = db.prepare('SELECT id FROM users WHERE name = ?').get(trimmed) as
    | { id: number }
    | undefined;
  if (existing) {
    return res.status(409).json({ error: 'user already exists', userId: existing.id });
  }

  const create = db.transaction(() => {
    const info = db.prepare('INSERT INTO users (name, password) VALUES (?, ?)').run(trimmed, hashPassword(pw));
    const userId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO accounts (user_id) VALUES (?)').run(userId);
    return userId;
  });
  const userId = create();

  const row = db
    .prepare(
      `SELECT u.id, u.name, u.role, a.id AS account_id, a.balance, u.created_at
       FROM users u JOIN accounts a ON a.user_id = u.id
       WHERE u.id = ?`,
    )
    .get(userId);
  // 注册即登录：签发 JWT 会话（sessions 表存 JWT + expires_at）
  const { token, expiresAt } = signSessionToken(userId);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt,
  );
  res.status(201).json({ user: row, token });
});

// GET /users — list users with balance（仅 admin）
accountsRouter.get('/users', requireAuth, requireRole('admin'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.role, a.id AS account_id, a.balance, u.created_at
       FROM users u JOIN accounts a ON a.user_id = u.id
       ORDER BY u.id`,
    )
    .all();
  res.json({ users: rows });
});

// GET /users/:id — user + balance（登录用户可查自己；admin 可查任意）
accountsRouter.get('/users/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid user id' });
  }
  const me = res.locals.user as { id: number; role: string };
  if (me.role !== 'admin' && me.id !== id) {
    return res.status(403).json({ error: '只能查看自己的账户信息' });
  }
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.role, a.id AS account_id, a.balance, u.created_at
       FROM users u JOIN accounts a ON a.user_id = u.id
       WHERE u.id = ?`,
    )
    .get(id);
  if (!row) {
    return res.status(404).json({ error: 'user not found' });
  }
  res.json({ user: row });
});

// POST /users/:id/deposit — top up balance, record transaction
// 仅 admin 直充（运营特权）。普通用户充值请走 POST /payments/deposit（支付通道）
accountsRouter.post('/users/:id/deposit', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid user id' });
  }
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }

  const deposit = db.transaction(() => {
    const acc = db
      .prepare('SELECT id, balance FROM accounts WHERE user_id = ?')
      .get(id) as { id: number; balance: number };
    const newBalance = acc.balance + amount;
    db.prepare("UPDATE accounts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(
      newBalance,
      acc.id,
    );
    const info = db
      .prepare('INSERT INTO transactions (account_id, type, amount) VALUES (?, ?, ?)')
      .run(acc.id, 'deposit', amount);
    return { accountId: acc.id, balance: newBalance, txId: Number(info.lastInsertRowid) };
  });
  const result = deposit();

  res.json({
    account: { id: result.accountId, balance: result.balance },
    transaction: { id: result.txId, type: 'deposit', amount },
  });
});
