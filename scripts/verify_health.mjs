// verify_health.mjs — /api/health 端到端验证 (轻量版: 适配实际 API schema)
// 用法: node scripts/verify_health.mjs [BASE]
const BASE = process.env.BASE || 'http://127.0.0.1:4100/api';
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  cond ? pass++ : fail++;
};

try {
  // /api/health 返回 200 + 基础 schema
  const r1 = await fetch(BASE + '/health');
  const j1 = await r1.json();
  ok(r1.status === 200, 'health 200', `status=${r1.status}`);
  ok(j1.status === 'ok', 'health.status=ok', `status=${j1.status}`);
  ok(j1.service === 'betting-api', 'health.service=betting-api', `service=${j1.service}`);
  ok(typeof j1.time === 'string' && j1.time.length > 0, 'health.time is ISO string', `time=${j1.time}`);
  // 可选字段（API 后续升级如果带这些就验证）
  if (j1.uptime !== undefined) {
    ok(typeof j1.uptime === 'number' && j1.uptime >= 0, 'health.uptime is number', `uptime=${j1.uptime}`);
  }
  if (j1.cache !== undefined) {
    ok(['fresh', 'cached'].includes(j1.cache), 'health.cache=fresh|cached', `cache=${j1.cache}`);
  }
  if (j1.services !== undefined) {
    ok(typeof j1.services === 'object', 'health.services is object');
  }
  console.log('---');
  console.log(`HEALTH_E2E=${fail === 0 ? 'ALL_OK' : 'SOME_FAIL'} (${pass} pass / ${fail} fail)`);
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 300));
  process.exit(1);
}
