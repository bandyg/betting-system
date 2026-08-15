import type { NextFunction, Request, Response } from 'express';
import db from '../db/index.js';

/** 登录用户信息（挂在 res.locals.user 上） */
export interface AuthedUser {
  id: number;
  name: string;
  role: string;
}

/** 从 Authorization: Bearer <token> 解析并校验 session */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: '未登录：缺少 Authorization 头' });
  }
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as AuthedUser | undefined;
  if (!row) {
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
