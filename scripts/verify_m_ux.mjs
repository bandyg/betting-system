// M 轮（赛事列表加载态）浏览器 E2E 验收：M1 大厅加载态指示 + M2 空态/错误态三态分离
// 用法: node scripts/verify_m_ux.mjs [BASE]
import { createRequire } from 'node:module';
const PW_DIR = process.env.PW_DIR || '/home/bandyg/.npm/_npx/9833c18b2d85bc59/node_modules/';
const require = createRequire(PW_DIR + 'x.js');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:4200';
const API = process.env.API || 'http://127.0.0.1:4100/api';
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  cond ? pass++ : fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noLoading = () => !document.body.innerText.includes('加载赛事中');

const ts = Date.now();
const APIJ = async (method, path, body, token) => {
  const res = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

try {
  // ===== 准备：admin 建用户 + 充 1000 + 建未来赛事/市场 =====
  const admin = (await APIJ('POST', '/auth/login', { name: 'admin', password: 'admin123' })).data;
  const aTok = admin.token;
  const ua = (await APIJ('POST', '/users', { name: 'muxa_' + ts, password: '123456' })).data.user;
  await APIJ('POST', '/auth/login', { name: 'muxa_' + ts, password: '123456' });
  await APIJ('POST', `/users/${ua.id}/deposit`, { amount: 1000 }, aTok);
  const mt = (await APIJ('POST', '/matches', { homeTeam: 'MUXHome' + ts, awayTeam: 'MUXAway' + ts, kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'MUXLeague' }, aTok)).data.match;
  const mk = (await APIJ('POST', `/matches/${mt.id}/markets`, { type: '1x2', line: null, odds: { home: 2.10, draw: 3.40, away: 3.20 } }, aTok)).data.market;
  ok(!!mk.id, '前置：测试赛事+市场已建', `match=${mt.id} market=${mk.id}`);

  const browser = await chromium.launch({
    executablePath: '/home/bandyg/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // 单一路由处理器 + 模式变量（避免 unroute 与延迟途中 continue 竞态）
  let routeMode = 'delay'; // 'delay' | '500' | 'abort'
  await page.route('**/api/matches*', async (route) => {
    if (routeMode === 'delay') await sleep(2000);
    if (routeMode === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '测试服务器错误' }) });
    if (routeMode === 'abort') return route.abort();
    try { await route.continue(); } catch (e) { /* route 已被处理 */ }
  });

  // ===== M1: 加载态指示（延迟 2s 的 /api/matches）=====
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400); // React 挂载 + refresh() 已发出（请求仍在 2s 延迟中）
  let body = await page.locator('body').innerText();
  ok(body.includes('加载赛事中'), 'M1a1 首帧加载期出现加载指示', body.slice(0, 160).replace(/\n/g, ' '));
  ok(!body.includes('没有符合条件的赛事'), 'M1a2 加载期不闪「没有符合条件的赛事」');

  await page.locator('.odds-chip').first().waitFor({ timeout: 20000 });
  body = await page.locator('body').innerText();
  ok(!body.includes('加载赛事中'), 'M1b1 数据到达后加载指示消失');
  const cardCount = await page.locator('.match-card').count();
  ok(cardCount > 0, 'M1b2 赛事列表正常渲染', `match-cards=${cardCount}`);

  // 手动 ↻ 刷新同样不闪空态（等加载完成再断言消失）
  await page.getByRole('button', { name: '↻' }).click();
  await page.waitForTimeout(300);
  body = await page.locator('body').innerText();
  ok(body.includes('加载赛事中'), 'M1c1 手动刷新出现加载指示');
  ok(!body.includes('没有符合条件的赛事'), 'M1c2 手动刷新不闪空态');
  await page.waitForFunction(noLoading, null, { timeout: 20000 });
  body = await page.locator('body').innerText();
  ok(!body.includes('加载赛事中'), 'M1c3 手动刷新加载完成指示消失');
  const cardCount2 = await page.locator('.match-card').count();
  ok(cardCount2 > 0, 'M1c4 刷新后赛事列表仍渲染', `match-cards=${cardCount2}`);

  // ===== M2a: 筛选组合无结果 → 才显示空态（已加载完毕）=====
  await page.getByPlaceholder('🔍 搜索队名...').fill('ZZZ_NOMATCH_' + ts);
  await page.waitForTimeout(400);
  body = await page.locator('body').innerText();
  ok(body.includes('没有符合条件的赛事'), 'M2a1 已加载 + 筛选无结果显示空态');
  ok(!body.includes('加载赛事中'), 'M2a2 空态时不显示加载指示');
  await page.getByPlaceholder('🔍 搜索队名...').fill('');

  // ===== M2b: API 500 → errText 错误消息，非空态 =====
  routeMode = '500';
  await page.getByRole('button', { name: '↻' }).click();
  await page.waitForTimeout(800);
  body = await page.locator('body').innerText();
  ok(body.includes('测试服务器错误'), 'M2b1 API 500 显示错误消息', body.slice(0, 160).replace(/\n/g, ' '));
  ok(!body.includes('没有符合条件的赛事'), 'M2b2 API 500 不显示空态');

  // ===== M2c: 断网（请求中止）→ 错误消息，非空态 =====
  routeMode = 'abort';
  await page.getByRole('button', { name: '↻' }).click();
  await page.waitForTimeout(800);
  const errCount = await page.locator('.msg.err').count();
  ok(errCount > 0, 'M2c1 断网显示错误消息区块', `msg.err=${errCount}`);
  body = await page.locator('body').innerText();
  ok(!body.includes('没有符合条件的赛事'), 'M2c2 断网不显示空态');

  // ===== M2d: 登录态 加载→列表 闭环（恢复延迟路由）=====
  routeMode = 'delay';
  await page.getByPlaceholder('用户').fill('muxa_' + ts);
  await page.getByPlaceholder('密码').fill('123456');
  await page.getByText('登录', { exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /投注记录/ }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /大厅/ }).click();
  await page.waitForTimeout(300);
  body = await page.locator('body').innerText();
  ok(body.includes('加载赛事中'), 'M2d1 登录态加载指示出现（加载→列表闭环）');
  await page.waitForFunction(noLoading, null, { timeout: 20000 });
  body = await page.locator('body').innerText();
  ok(body.includes('muxa_' + ts) && body.includes('¥1000'), 'M2d2 登录后头部显示用户名+余额');
  ok(!body.includes('加载赛事中'), 'M2d3 登录态加载完成指示消失、列表渲染');
  const cardCount3 = await page.locator('.match-card').count();
  ok(cardCount3 > 0, 'M2d4 登录态赛事列表渲染', `match-cards=${cardCount3}`);

  await browser.close();
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 400));
  fail++;
}

console.log(`\n===== M UX E2E: ${pass} passed, ${fail} failed =====`);
process.exit(fail === 0 ? 0 : 1);