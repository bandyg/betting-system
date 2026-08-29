#!/usr/bin/env node
/**
 * verify_health.mjs — /api/health 验证脚本（O1 轮）
 * 覆盖（≥10 断言）：
 *   1. GET /api/health → 200
 *   2. body.status === 'ok'（核心全 ok）
 *   3. uptime 为正数
 *   4. time 可解析 ISO
 *   5. services 含 web/api/db/redis/postgres 5 键
 *   6. web.status ok 且 httpStatus 200-399
 *   7. db.status ok（真实 SELECT 1）
 *   8. api.status ok（进程内判定，无 loopback）
 *   9. redis 未启用 → not_configured
 *  10. postgres 未启用 → not_configured
 *  11. 安全头（X-Content-Type-Options nosniff）存在
 *  12. X-Health-Bypass-Cache: true → cache: fresh
 *  13. 回归：GET /health（liveness）200
 *  14. 回归：GET /api/matches 200
 * 用法：node apps/api/scripts/verify_health.mjs （仓库根目录）
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4100';

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`✅ ${name} — ${detail ?? ''}`); }
  else { failed++; console.log(`❌ ${name} — ${detail ?? ''}`); }
}

const res = await fetch(BASE + '/api/health');
const body = await res.json().catch(() => null);
const sec = res.headers.get('x-content-type-options');

check('HTTP 200', res.status === 200, `status=${res.status}`);
check('status=ok', body?.status === 'ok', `status=${body?.status}`);
check('uptime>0', typeof body?.uptime === 'number' && body.uptime > 0, `uptime=${body?.uptime}`);
check('time ISO', typeof body?.time === 'string' && !Number.isNaN(Date.parse(body.time)), body?.time);
check('services 5 keys', body?.services && ['web', 'api', 'db', 'redis', 'postgres'].every(k => k in body.services), Object.keys(body?.services ?? {}).join(','));
check('web ok 200-399', body?.services?.web?.status === 'ok' && body.services.web.httpStatus >= 200 && body.services.web.httpStatus < 400, JSON.stringify(body?.services?.web));
check('db ok SELECT 1', body?.services?.db?.status === 'ok' && body.services.db.test === 'SELECT 1', JSON.stringify(body?.services?.db));
check('api ok in-process', body?.services?.api?.status === 'ok' && body.services.api.detail === 'in-process', JSON.stringify(body?.services?.api));
check('redis not_configured', body?.services?.redis?.status === 'not_configured', JSON.stringify(body?.services?.redis));
check('postgres not_configured', body?.services?.postgres?.status === 'not_configured', JSON.stringify(body?.services?.postgres));
check('安全头 nosniff', sec === 'nosniff', `x-content-type-options=${sec}`);

// bypass cache → fresh
const res2 = await fetch(BASE + '/api/health', { headers: { 'X-Health-Bypass-Cache': 'true' } });
const body2 = await res2.json().catch(() => null);
check('bypass → cache=fresh', body2?.cache === 'fresh', `cache=${body2?.cache}`);

// 回归：liveness /health
const hl = await fetch(BASE + '/health');
const hlBody = await hl.json().catch(() => null);
check('回归 /health 200', hl.status === 200 && hlBody?.status === 'ok', JSON.stringify(hlBody));

// 回归：/api/matches
const mm = await fetch(BASE + '/api/matches');
check('回归 /api/matches 200', mm.status === 200, `status=${mm.status}`);

console.log(`\nhealth verify: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);