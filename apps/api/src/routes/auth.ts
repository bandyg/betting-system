import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import db, { hashPassword } from '../db/index.js';

export const authRouter = Router();

// POST /auth/login — 用户名 + 密码登录，返回用户信息（不含密码）+ session token
authRouter.post('/auth/login', (req, res) => {
  const { name, password } = req.body ?? {};
  if (typeof name !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'name and password are required' });
  }
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.password, u.role, a.id AS account_id, a.balance, u.created_at
       FROM users u JOIN accounts a ON a.user_id = u.id
       WHERE u.name = ?`,
    )
    .get(name.trim()) as
    | { id: number; name: string; password: string; role: string; account_id: number; balance: number; created_at: string }
    | undefined;

  if (!row || row.password !== hashPassword(password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  // 创建 session token（登录态：前端 localStorage 持有，请求带 Authorization: Bearer <token>）
  const token = randomUUID();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, row.id);

  const { password: _pw, ...user } = row;
  res.json({ user, token });
});

// POST /auth/logout — 注销当前 token
authRouter.post('/auth/logout', (req, res) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.json({ ok: true });
});
