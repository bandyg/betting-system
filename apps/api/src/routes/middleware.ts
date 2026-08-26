import type { NextFunction, Request, Response } from 'express';
import db from '../db/index.js';
import { verifySessionToken } from '../jwt.js';

/** 登录用户信息（挂在 res.locals.user 上） */
export interface AuthedUser {
  id: number;
  name: string;
  role: string;
}

/** 从 Authorization: Bearer *** 解析并校验 JWT 会话（验签 + 查 sessions 行 + 过期检查） */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: '未登录：缺少 Authorization 头' });
  }
  // 验签（HS256、exp、篡改签名）——任何不合法直接 401，不查库
  const uid = verifySessionToken(token);
  if (uid === null) {
    return res.status(401).json({ error: '登录已失效，请重新登录' });
  }
  // 会话存在性 + 过期（logout 吊销/过期行 → 401）
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > ?)`,
    )
    .get(token, new Date().toISOString()) as AuthedUser | undefined;
  if (!row || Number(row.id) !== uid) {
    return res.status(401).json({ error: '登录已失效，请重新登录' });
  }
  res.locals.user = row;
  next();
}

/** 要求 role 为 admin（在 requireAuth 之后使用） */
export function requireRole(role: 'admin' | 'user' = 'admin') {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = res.locals.user as AuthedUser | undefined;
    if (u?.role !== role) {
      return res.status(403).json({ error: '没有权限执行此操作' });
    }
    next();
  };
}

/** 要求 role 为 admin 或 support（客服，在 requireAuth 之后使用） */
export function requireSupport(req: Request, res: Response, next: NextFunction) {
  const u = res.locals.user as AuthedUser | undefined;
  if (!u || (u.role !== 'admin' && u.role !== 'support')) {
    return res.status(403).json({ error: '仅客服或管理员可执行此操作' });
  }
  next();
}