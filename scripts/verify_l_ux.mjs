// L 轮（错误提示友好化）浏览器 E2E 验收：L1 投注记录匿名友好引导 + L2 提示消息自动消失
// 用法: node scripts/verify_l_ux.mjs [BASE]
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
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });

  // ===== L1a: 匿名切「投注记录」tab → 友好引导、无 Error: =====
  await page.getByRole('button', { name: /投注记录/ }).click();
  await page.waitForTimeout(800);
  let body = await page.locator('body').innerText();
  ok(!body.includes('Error:'), 'L1a1 匿名记录页无 Error: 字样', body.slice(0, 200).replace(/\n/g, ' '));
  ok(body.includes('请先登录后查看投注记录'), 'L1a2 匿名记录页显示登录引导', body.slice(0, 200).replace(/\n/g, ' '));
  ok(!body.includes('未登录：缺少 Authorization'), 'L1a3 匿名记录页不出现后端 401 原文');

  // ===== L2a: 未登录点 odds → 提示出现并自动消失 =====
  await page.getByRole('button', { name: /大厅/ }).click();
  await page.waitForTimeout(600);
  const oddsChip = page.locator('.odds-chip:not(.disabled)').first();
  await oddsChip.waitFor({ timeout: 15000 });
  await oddsChip.click();
  await page.waitForTimeout(500);
  body = await page.locator('body').innerText();
  ok(body.includes('请先登录再下注'), 'L2a1 未登录点赔率出现提示');
  await sleep(4200);
  body = await page.locator('body').innerText();
  ok(!body.includes('请先登录再下注'), 'L2a2 提示约 3.5s 自动消失');

  // ===== L2b: 连续点多个 odds 不残留（timer 重置，单条消息）=====
  await oddsChip.click();
  await page.waitForTimeout(1200);
  await oddsChip.click();
  await page.waitForTimeout(500);
  body = await page.locator('body').innerText();
  const msgCount = (body.match(/请先登录再下注/g) || []).length;
  ok(msgCount === 1, 'L2b1 连点多个 odds 提示只渲染一条', `count=${msgCount}`);
  await page.waitForTimeout(3800);
  body = await page.locator('body').innerText();
  ok(!body.includes('请先登录再下注'), 'L2b2 连点后的提示最终消失');

  // ===== 登录用户 A =====
  await page.getByPlaceholder('用户').fill('luxa_' + ts);
  await page.getByPlaceholder('密码').fill('123456');
  await page.getByText('登录', { exact: true }).click();
  await page.waitForTimeout(1200);
  body = await page.locator('body').innerText();
  ok(body.includes('luxa_' + ts) && body.includes('¥1000'), 'Lx0 登录成功头部显示用户名+余额');

  // ===== L2c: 下注成功消息自动消失 =====
  await oddsChip.click();
  await page.waitForTimeout(500);
  await page.locator('.bet-slip input[type=number]').fill('100');
  await page.getByText('提交下注', { exact: true }).click();
  await page.waitForTimeout(800);
  body = await page.locator('body').innerText();
  ok(body.includes('下注成功：1 笔'), 'L2c1 下注成功消息出现', body.slice(0, 200).replace(/\n/g, ' '));
  await sleep(4200);
  body = await page.locator('body').innerText();
  ok(!body.includes('下注成功：1 笔'), 'L2c2 下注成功消息自动消失');

  // ===== L1b: 登录后切「投注记录」→ 列表正常加载、无 Error: =====
  await page.getByRole('button', { name: /投注记录/ }).click();
  await page.waitForTimeout(1000);
  body = await page.locator('body').innerText();
  ok(body.includes('投注记录'), 'L1b1 记录页标题正常');
  ok(body.includes('LUXHome') || body.includes('open'), 'L1b2 记录列表加载出数据', body.slice(0, 300).replace(/\n/g, ' '));
  ok(!body.includes('Error:') && !body.includes('请先登录后查看投注记录'), 'L1b3 登录态无引导/错误残留');

  // ===== L1c: 登录失效（服务端 session 删除，前端 token 仍在）→ 友好提示 =====
  const browserTok = await page.evaluate(() => localStorage.getItem('betting.token'));
  await APIJ('POST', '/auth/logout', undefined, browserTok); // 服务端注销浏览器会话，前端状态不变
  await page.getByRole('button', { name: /大厅/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /投注记录/ }).click();
  await page.waitForTimeout(1000);
  body = await page.locator('body').innerText();
  ok(body.includes('登录状态已失效，请重新登录'), 'L1c1 登录失效显示友好提示', body.slice(0, 200).replace(/\n/g, ' '));
  ok(!body.includes('Error:') && !body.includes('未登录：缺少 Authorization'), 'L1c2 登录失效无裸错误文本');

  await browser.close();
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 400));
  fail++;
}

console.log('---');
console.log(`L_UX_E2E_RESULT=${fail === 0 ? 'ALL_OK' : 'SOME_FAIL'} (${pass} pass / ${fail} fail)`);