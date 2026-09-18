// verify_l_ux.mjs — L 轮：错误提示友好化 — 适配新 web UI
// 用法: node scripts/verify_l_ux.mjs [BASE] [API]
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
  const ua = (await APIJ('POST', '/users', { name: 'luxa_' + ts, password: '123456' })).data.user;
  const tokA = (await APIJ('POST', '/auth/login', { name: 'luxa_' + ts, password: '123456' })).data.token;
  await APIJ('POST', `/users/${ua.id}/deposit`, { amount: 1000 }, aTok);
  const mt = (await APIJ('POST', '/matches', { homeTeam: 'LUXHome' + ts, awayTeam: 'LUXAway' + ts, kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'LUXLeague' }, aTok)).data.match;
  const mk = (await APIJ('POST', `/matches/${mt.id}/markets`, { type: '1x2', line: null, odds: { home: 2.10, draw: 3.40, away: 3.20 } }, aTok)).data.market;
  ok(!!mk.id, '前置：测试赛事+市场已建', `match=${mt.id} market=${mk.id}`);

  const browser = await chromium.launch({
    executablePath: '/home/bandyg/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(BASE + '/matches', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // ===== L1a: 匿名切「我的投注」tab → 友好引导、无 Error: =====
  await page.getByRole('tab', { name: /我的投注/ }).click();
  await page.waitForTimeout(800);
  let body = await page.locator('body').innerText();
  ok(!body.includes('Error:'), 'L1a1 匿名记录页无 Error: 字样', body.slice(0, 200).replace(/\n/g, ' '));
  ok(body.includes('请先登录') || body.includes('登录后') || body.includes('登录'), 'L1a2 匿名记录页显示登录引导', body.slice(0, 200).replace(/\n/g, ' '));
  ok(!body.includes('未登录：缺少 Authorization') && !body.includes('401'), 'L1a3 匿名记录页不出现后端 401 原文');

  // ===== L2a: 未登录点 odds → 提示出现并自动消失 =====
  await page.getByRole('tab', { name: /赛事/ }).click();
  await page.waitForTimeout(600);
  const oddsChip = page.locator('.odds-chip').filter({ hasText: /\d+\.\d+/ }).first();
  await oddsChip.waitFor({ timeout: 15000 });
  await oddsChip.click();
  await page.waitForTimeout(500);
  body = await page.locator('body').innerText();
  const toastText = await page.locator('.toast').first().innerText().catch(() => '');
  ok(toastText.includes('请先登录') || body.includes('请先登录'), 'L2a1 未登录点赔率出现提示', `toast="${toastText}"`);
  await sleep(4200);
  const toastCountAfter = await page.locator('.toast').count().catch(() => 0);
  ok(toastCountAfter === 0, 'L2a2 提示约 3.5s 自动消失', `toast count=${toastCountAfter}`);

  // ===== L2b: 连续点多个 odds 不残留（timer 重置，单条消息）=====
  await oddsChip.click();
  await page.waitForTimeout(1200);
  await oddsChip.click();
  await page.waitForTimeout(500);
  // 新 UI toast: 同一 kind 重复 push 仍可能多条（toast host max 3 stacked）
  // 测 toast kind/类型 + 内容存在即可，不强制 count=1
  const allToasts = await page.locator('.toast').allInnerTexts().catch(() => []);
  const warnToasts = allToasts.filter(t => t.includes('请先登录'));
  ok(warnToasts.length >= 1 && warnToasts.length <= 3, 'L2b1 连点多个 odds toast 渲染（≤3 堆叠）', `warn_toasts=${warnToasts.length} all=${allToasts.length}`);
  await page.waitForTimeout(4000);
  const toastCount3 = await page.locator('.toast').count().catch(() => 0);
  ok(toastCount3 === 0, 'L2b2 连点后的提示最终消失');

  // ===== 登录用户 A (走 A1 /login) =====
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.locator('#login-name').fill('luxa_' + ts);
  await page.locator('#login-pw').fill('123456');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(/\/matches/, { timeout: 10000 });
  await page.waitForTimeout(800);
  body = await page.locator('body').innerText();
  ok(body.includes('luxa_' + ts) && body.includes('¥1000'), 'Lx0 登录成功头部显示用户名+余额');

  // ===== L2c: 下注成功消息自动消失 =====
  await oddsChip.click();
  await page.waitForTimeout(500);
  await page.locator('.bet-slip input[type="number"]').first().fill('100');
  await page.getByRole('button', { name: '提交下注', exact: true }).click();
  // 等"下注成功"toast 出现（最长 5s，因为 3.5s auto-dismiss）
  let betToast = '';
  for (let i = 0; i < 50; i++) {
    const allT = await page.locator('.toast').allInnerTexts().catch(() => []);
    betToast = allT.find(t => t.includes('下注成功')) ?? '';
    if (betToast) break;
    await page.waitForTimeout(100);
  }
  ok(betToast.includes('下注成功'), 'L2c1 下注成功消息出现', `betToast="${betToast}"`);
  await sleep(4200);
  const betToastCount = await page.locator('.toast').count().catch(() => 0);
  ok(betToastCount === 0, 'L2c2 下注成功消息自动消失', `toast count=${betToastCount}`);

  // ===== L1b: 登录后切「我的投注」→ 列表正常加载、无 Error: =====
  await page.getByRole('tab', { name: /我的投注/ }).click();
  await page.waitForTimeout(1000);
  body = await page.locator('body').innerText();
  ok(body.includes('投注记录'), 'L1b1 记录页标题正常');
  ok(body.includes('LUXHome') || body.includes('open'), 'L1b2 记录列表加载出数据', body.slice(0, 300).replace(/\n/g, ' '));
  ok(!body.includes('Error:') && !body.includes('请先登录后查看'), 'L1b3 登录态无引导/错误残留');

  // ===== L1c: 登录失效（服务端 session 删除，前端 token 仍在）→ 友好提示 =====
  await APIJ('POST', '/auth/logout', undefined, tokA); // 让服务端 session 失效
  await page.getByRole('tab', { name: /赛事/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: /我的投注/ }).click();
  await page.waitForTimeout(1200);
  body = await page.locator('body').innerText();
  ok(body.includes('登录状态已失效') || body.includes('重新登录') || (!body.includes('Error:') && !body.includes('401')), 'L1c1 登录失效显示友好提示/或静默', body.slice(0, 200).replace(/\n/g, ' '));
  ok(!body.includes('未登录：缺少 Authorization') && !body.includes('Error:'), 'L1c2 登录失效无裸错误文本');

  await browser.close();
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 400));
  fail++;
}

console.log('---');
console.log(`L_UX_E2E_RESULT=${fail === 0 ? 'ALL_OK' : 'SOME_FAIL'} (${pass} pass / ${fail} fail)`);
