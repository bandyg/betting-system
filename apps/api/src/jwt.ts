import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import db from './db/index.js';

/** 会话有效期：7 天（与 N 轮验收一致：login 返回 HS256 3 段 JWT、7d 过期） */
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

/**
 * JWT 签名密钥：首次启动时随机生成并持久化到 settings 表（jwt_secret），
 * 重启/多进程共享同一密钥；不依赖环境变量/文件，部署零配置。
 */
function getSecret(): string {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'jwt_secret'")
    .get() as { value: string } | undefined;
  if (!row?.value) throw new Error('jwt_secret not initialized in settings');
  return row.value;
}

/** 签发 HS256 会话 JWT（payload: sub=userId），返回 token + 过期时间（ISO） */
export function signSessionToken(userId: number): { token: string; expiresAt: string } {
  const secret = getSecret();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  // jti=随机 ID：保证同秒内重复登录产出不同 token（sessions.token 是 PRIMARY KEY，防冲突）
  const token = jwt.sign({ sub: String(userId), jti: randomUUID() }, secret, {
    algorithm: 'HS256',
    expiresIn: SESSION_TTL_SECONDS,
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

/**
 * 校验 JWT：签名/过期/算法任何不合法 → null（调用方返回 401）。
 * 只验签，不查 sessions 行 —— session 存在性由 requireAuth 查库决定（支持 logout 吊销）。
 */
export function verifySessionToken(token: string): number | null {
  try {
    const secret = getSecret();
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const uid = Number(payload.sub);
    return Number.isInteger(uid) && uid > 0 ? uid : null;
  } catch {
    return null;
  }
}