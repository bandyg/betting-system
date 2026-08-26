import { Router } from 'express';
import db, { verifyPassword, hashPassword } from '../db/index.js';
import { signSessionToken } from '../jwt.js';

export const authRouter = Router();

// ===== 登录限速（内存态，单进程适用）：同 IP 连续 ≥5 次错误登录 → 429 =====
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 分钟窗口
const failStore = new Map<string, { count: number; firstAt: number }>();

function rateLimited(ip: string): boolean {
  const rec = failStore.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.firstAt > WINDOW_MS) {
    failStore.delete(ip);
    return false;
  }
  return rec.count >= MAX_FAILS;
}

function recordFail(ip: string): void {
  const rec = failStore.get(ip);
  if (!rec || Date.now() - rec.firstAt > WINDOW_MS) {
    failStore.set(ip, { count: 1, firstAt: Date.now() });
    return;
  }
  rec.count += 1;
}

function clearFails(ip: string): void {
  failStore.delete(ip);
}

// POST /auth/login — bcrypt 密码校验（兼容历史 SHA-256，登录成功自动升级）+ JWT 会话
authRouter.post('/auth/login', (req, res) => {
  const ip = req.ip ?? 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: '登录尝试过于频繁，请稍后再试' });
  }

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

  if (!row || !verifyPassword(password, row.password)) {
    recordFail(ip);
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  clearFails(ip);

  // 历史 SHA-256 哈希账号登录成功 → 惰性升级为 bcrypt 落库（N1 验收：自动升级）
  if (!row.password.startsWith('$2')) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), row.id);
  }

  // JWT 会话（HS256，7d 过期）；sessions 表存 JWT + expires_at，logout 删行即吊销
  const { token, expiresAt } = signSessionToken(row.id);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    row.id,
    expiresAt,
  );

  const { password: _pw, ...user } = row;
  res.json({ user, token });
});

// POST /auth/logout — 注销当前 token（删除 sessions 行 → JWT 立即失效）
authRouter.post('/auth/logout', (req, res) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.json({ ok: true });
});