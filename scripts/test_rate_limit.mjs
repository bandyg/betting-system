// test_rate_limit.mjs — R7 全局限流单元测试（Node 24 --test + tsx）
//
// 覆盖：key 维度 / 窗口计数 / 超限 429 + 头 / 跨 scope 独立 / fail-open / cleanup / env 覆盖

import test from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, _resetBuckets, startRateLimitCleanup, stopRateLimitCleanup } from '../apps/api/src/rateLimit.ts';

// 用 mock req/res 模拟 express 中间件调用（不依赖启动 express）
function mockReqRes(ip = '1.2.3.4', userId) {
  const nextCalled = { v: false };
  const req = { ip, socket: { remoteAddress: ip } };
  const res = {
    locals: { user: userId ? { id: userId } : undefined },
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json(body) { this.body = body; return this; },
    ended: false,
  };
  const next = () => { nextCalled.v = true; };
  return { req, res, nextCalled, next };
}

function setupEnv(extra = {}) {
  // 清掉所有 RATE_LIMIT_* env 干扰
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('RATE_LIMIT_')) delete process.env[k];
  }
  Object.assign(process.env, extra);
}
function teardownEnv() {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('RATE_LIMIT_')) delete process.env[k];
  }
}

test('R7-01 keyBy=ip：同 IP 第 6 次 → 429', () => {
  setupEnv({ RATE_LIMIT_REGISTER_MAX: '5', RATE_LIMIT_REGISTER_WINDOW_MS: '60000' });
  _resetBuckets();
  const mw = rateLimit({ scope: 'register', keyBy: 'ip' });
  const ip = '5.6.7.8';
  for (let i = 1; i <= 5; i++) {
    const m = mockReqRes(ip);
    mw(m.req, m.res, m.next);
    assert.equal(m.nextCalled.v, true, `第 ${i} 次应通过`);
  }
  const last = mockReqRes(ip);
  mw(last.req, last.res, last.next);
  assert.equal(last.res.statusCode, 429, '第 6 次应 429');
  assert.equal(last.res.headers['Retry-After'], '60');
  assert.equal(last.res.headers['X-RateLimit-Limit'], '5');
  assert.equal(last.res.headers['X-RateLimit-Remaining'], '0');
  assert.match(last.res.body.error, /请求过于频繁/);
  teardownEnv();
});

test('R7-02 keyBy=ip：不同 IP 各自计数', () => {
  setupEnv({ RATE_LIMIT_REGISTER_MAX: '5' });
  _resetBuckets();
  const mw = rateLimit({ scope: 'register', keyBy: 'ip' });
  for (let i = 0; i < 5; i++) {
    const m = mockReqRes(`10.0.0.${i}`);
    mw(m.req, m.res, m.next);
    assert.equal(m.nextCalled.v, true);
  }
  // 第 6 个不同 IP 仍应通过
  const m = mockReqRes('11.0.0.1');
  mw(m.req, m.res, m.next);
  assert.equal(m.nextCalled.v, true);
  teardownEnv();
});

test('R7-03 keyBy=user：不同 user 独立计数', () => {
  setupEnv({ RATE_LIMIT_BET_MAX: '3' });
  _resetBuckets();
  const mw = rateLimit({ scope: 'bet', keyBy: 'user' });
  for (let i = 1; i <= 3; i++) {
    const m = mockReqRes('1.1.1.1', 100);
    mw(m.req, m.res, m.next);
    assert.equal(m.nextCalled.v, true, `user 100 第 ${i} 次通过`);
  }
  const last = mockReqRes('2.2.2.2', 100); // 同 user 不同 IP
  mw(last.req, last.res, last.next);
  assert.equal(last.res.statusCode, 429, '同 user 不同 IP 第 4 次仍 429');
  // 另一 user 不受影响
  const other = mockReqRes('3.3.3.3', 200);
  mw(other.req, other.res, other.next);
  assert.equal(other.nextCalled.v, true);
  teardownEnv();
});

test('R7-04 keyBy=user 但无 user：fail-open（next() 通过，让 requireAuth 401）', () => {
  setupEnv({ RATE_LIMIT_BET_MAX: '1' });
  _resetBuckets();
  const mw = rateLimit({ scope: 'bet', keyBy: 'user' });
  const m = mockReqRes('1.2.3.4', undefined);
  mw(m.req, m.res, m.next);
  assert.equal(m.nextCalled.v, true, '未登录场景不应被限流，让上层 401 处理');
  teardownEnv();
});

test('R7-05 跨 scope 独立：register 不影响 bet 计数', () => {
  setupEnv({ RATE_LIMIT_REGISTER_MAX: '2', RATE_LIMIT_BET_MAX: '2' });
  _resetBuckets();
  const regMw = rateLimit({ scope: 'register', keyBy: 'ip' });
  const betMw = rateLimit({ scope: 'bet', keyBy: 'user' });
  // 注册用尽
  for (let i = 0; i < 2; i++) regMw(mockReqRes('1.1.1.1').req, mockReqRes('1.1.1.1').res, () => {});
  const reg = mockReqRes('1.1.1.1');
  regMw(reg.req, reg.res, () => {});
  assert.equal(reg.res.statusCode, 429, 'register 第 3 次 429');
  // bet 不应受影响
  const bet = mockReqRes('9.9.9.9', 100);
  betMw(bet.req, bet.res, bet.next);
  assert.equal(bet.nextCalled.v, true);
  teardownEnv();
});

test('R7-06 X-RateLimit-* 头在每次响应都设置', () => {
  setupEnv({ RATE_LIMIT_BET_MAX: '10' });
  _resetBuckets();
  const mw = rateLimit({ scope: 'bet', keyBy: 'user' });
  const m1 = mockReqRes('1.1.1.1', 100);
  mw(m1.req, m1.res, m1.next);
  assert.equal(m1.res.headers['X-RateLimit-Limit'], '10');
  assert.equal(m1.res.headers['X-RateLimit-Remaining'], '9');
  assert.ok(Number(m1.res.headers['X-RateLimit-Reset']) > Date.now() / 1000);
  teardownEnv();
});

test('R7-07 窗口过期：窗口外重新计数', async () => {
  setupEnv({ RATE_LIMIT_REGISTER_MAX: '2', RATE_LIMIT_REGISTER_WINDOW_MS: '100' });
  _resetBuckets();
  const mw = rateLimit({ scope: 'register', keyBy: 'ip' });
  for (let i = 0; i < 2; i++) mw(mockReqRes('1.1.1.1').req, mockReqRes('1.1.1.1').res, () => {});
  const blocked = mockReqRes('1.1.1.1');
  mw(blocked.req, blocked.res, () => {});
  assert.equal(blocked.res.statusCode, 429);
  // 等窗口过期
  await new Promise((r) => setTimeout(r, 150));
  const fresh = mockReqRes('1.1.1.1');
  mw(fresh.req, fresh.res, fresh.next);
  assert.equal(fresh.nextCalled.v, true, '窗口过期后计数应重置');
  teardownEnv();
});

test('R7-08 default 值：scope 未知时用 fallback（max=30, window=60s）', () => {
  setupEnv();
  _resetBuckets();
  const mw = rateLimit({ scope: 'unknown_scope_xyz', keyBy: 'ip' });
  const m = mockReqRes('1.1.1.1');
  mw(m.req, m.res, m.next);
  assert.equal(m.res.headers['X-RateLimit-Limit'], '30');
  teardownEnv();
});

test('R7-09 cleanup：startRateLimitCleanup 删过期 bucket', async () => {
  setupEnv({ RATE_LIMIT_BET_MAX: '1', RATE_LIMIT_BET_WINDOW_MS: '50' });
  _resetBuckets();
  const mw = rateLimit({ scope: 'bet', keyBy: 'user' });
  mw(mockReqRes('1.1.1.1', 100).req, mockReqRes('1.1.1.1', 100).res, () => {});
  // 等过期
  await new Promise((r) => setTimeout(r, 100));
  startRateLimitCleanup(50); // 50ms 扫一次
  await new Promise((r) => setTimeout(r, 150));
  // 之后再请求应重新计数（不是上一轮的继续）
  const m = mockReqRes('1.1.1.1', 100);
  mw(m.req, m.res, m.next);
  assert.equal(m.nextCalled.v, true, 'cleanup 后旧 bucket 已清，重置计数');
  stopRateLimitCleanup();
  teardownEnv();
});