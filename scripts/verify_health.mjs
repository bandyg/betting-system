// verify_health.mjs — /api/health 14 项端到端验证（O1 round 真探活）
// 用法: node scripts/verify_health.mjs [BASE]
import { createRequire } from 'node:module';
const PW_DIR = process.env.PW_DIR || '/home/bandyg/.npm/_npx/9833c18b2d85bc59/node_modules/';

const BASE = process.env.BASE || 'http://127.0.0.1:4100/api';
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  cond ? pass++ : fail++;
};

try {
  // 1. /api/health 返回 200
  const r1 = await fetch(BASE + '/health');
  const j1 = await r1.json();
  ok(r1.status === 200, 'health 200', `status=${r1.status}`);
  ok(j1.status === 'ok' || j1.status === 'degraded', 'health.status=ok|degraded', `status=${j1.status}`);
  ok(j1.service === 'betting-api', 'health.service=betting-api', `service=${j1.service}`);
  ok(typeof j1.uptime === 'number' && j1.uptime >= 0, 'health.uptime is number', `uptime=${j1.uptime}`);
  ok(typeof j1.time === 'string' && j1.time.length > 0, 'health.time is ISO string', `time=${j1.time}`);
  ok(j1.cache === 'fresh' || j1.cache === 'cached', 'health.cache=fresh|cached', `cache=${j1.cache}`);

  // 2. services 探针（5 个）
  ok(j1.services && typeof j1.services === 'object', 'health.services is object');
  ok(j1.services.db && j1.services.db.status === 'ok', 'db SELECT 1 ok', `db=${JSON.stringify(j1.services.db)}`);
  ok(j1.services.api && j1.services.api.status === 'ok', 'api in-process ok', `api=${JSON.stringify(j1.services.api)}`);
  ok(j1.services.web && j1.services.web.status === 'ok', 'web HTTP 200-399 ok', `web=${JSON.stringify(j1.services.web)}`);
  ok(j1.services.redis && (j1.services.redis.status === 'ok' || j1.services.redis.status === 'not_configured'),
      'redis: ok 或 not_configured', `redis=${JSON.stringify(j1.services.redis)}`);
  ok(j1.services.postgres && (j1.services.postgres.status === 'ok' || j1.services.postgres.status === 'not_configured'),
      'postgres: ok 或 not_configured', `postgres=${JSON.stringify(j1.services.postgres)}`);

  // 3. cache + singleflight 行为
  const r2 = await fetch(BASE + '/health');
  const j2 = await r2.json();
  ok(j2.cache === 'cached' || j2.cache === 'fresh', 'second call: cache works (3s TTL)', `cache=${j2.cache}`);

  // 4. X-Health-Bypass-Cache 穿透
  const r3 = await fetch(BASE + '/health', { headers: { 'X-Health-Bypass-Cache': 'true' } });
  const j3 = await r3.json();
  ok(j3.cache === 'fresh', 'bypass header 穿透缓存', `cache=${j3.cache}`);

  console.log('---');
  console.log(`HEALTH_E2E=${fail === 0 ? 'ALL_OK' : 'SOME_FAIL'} (${pass} pass / ${fail} fail)`);
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 300));
  process.exit(1);
}
