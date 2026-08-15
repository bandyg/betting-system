import { Router } from 'express';
import db, { hashPassword } from '../db/index.js';

export const authRouter = Router();

// POST /auth/login — 用户名 + 密码登录，返回用户信息（不含密码）
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

  const { password: _pw, ...user } = row;
  res.json({ user });
});
