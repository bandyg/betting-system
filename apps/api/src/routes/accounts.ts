import { Router } from 'express';
import db from '../db/index.js';

export const accountsRouter = Router();

// POST /users — create user + account (balance 0)
accountsRouter.post('/users', (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required (non-empty string)' });
  }
  const trimmed = name.trim();
  const existing = db.prepare('SELECT id FROM users WHERE name = ?').get(trimmed) as
    | { id: number }
    | undefined;
  if (existing) {
    return res.status(409).json({ error: 'user already exists', userId: existing.id });
  }

  const create = db.transaction(() => {
    const info = db.prepare('INSERT INTO users (name) VALUES (?)').run(trimmed);
    const userId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO accounts (user_id) VALUES (?)').run(userId);
    return userId;
  });
  const userId = create();

  const row = db
    .prepare(
      `SELECT u.id, u.name, a.id AS account_id, a.balance
       FROM users u JOIN accounts a ON a.user_id = u.id
       WHERE u.id = ?`,
    )
    .get(userId);
  res.status(201).json({ user: row });
});

// GET /users/:id — user + balance
accountsRouter.get('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid user id' });
  }
  const row = db
    .prepare(
      `SELECT u.id, u.name, a.id AS account_id, a.balance, u.created_at
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
accountsRouter.post('/users/:id/deposit', (req, res) => {
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
