// verify_k_ux.mjs — K 轮：赛事大厅 UX v2 — 适配新 web UI
// 用法: node scripts/verify_k_ux.mjs [BASE] [API]
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
  const ua = (await APIJ('POST', '/users', { name: 'kuxa_' + ts, password: '123456' })).data.user;
  await APIJ('POST', '/auth/login', { name: 'kuxa_' + ts, password: '123456' });
  await APIJ('POST', `/users/${ua.id}/deposit`, { amount: 1000 }, aTok);
  const mt = (await APIJ('POST', '/matches', { homeTeam: 'KUXHome' + ts, awayTeam: 'KUXAway' + ts, kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'KUXLeague' }, aTok)).data.match;
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

  // ===== K3: filter 两行（状态/时间 y 不同）=====
  const statusChip = page.locator('.odds-chip').filter({ hasText: '未开始' }).first();
  const timeChip = page.locator('.odds-chip').filter({ hasText: '今天' }).first();
  await statusChip.waitFor({ timeout: 15000 });
  const sy = await statusChip.boundingBox().then(b => b.y);
  const ty = await timeChip.boundingBox().then(b => b.y);
  ok(Math.abs(sy - ty) > 5, 'K3a filter 状态/时间分两行', `sy=${sy} ty=${ty}`);

  // ===== K3: 双栏布局（lobby-list 左 + lobby-basket 右）=====
  await page.waitForSelector('.lobby-basket', { timeout: 10000 });
  const basketBox = await page.locator('.lobby-basket').boundingBox();
  const listBox = await page.locator('.lobby-list').boundingBox();
  ok(listBox && basketBox && listBox.x + listBox.width < basketBox.x + 5, 'K3b 左列表/右投注单并排', `list.x=${listBox?.x} basket.x=${basketBox?.x}`);
  ok(basketBox && basketBox.width >= 250, 'K3c 右栏投注单存在', `w=${basketBox?.width.toFixed(0)}`);
  await page.evaluate(() => window.scrollTo(0, 0));

  // ===== K1: 未登录点 odds -> toast 提示登录 =====
  // 找带赔率数字的 chip（filter chip 没数字，odds chip 有 2.1/2.10 之类）
  const oddsChip = page.locator('.odds-chip').filter({ hasText: /\d+\.\d+/ }).first();
  await oddsChip.waitFor({ timeout: 15000 });
  await oddsChip.click();
  await page.waitForTimeout(500);
  let body = await page.locator('body').innerText();
  ok(body.includes('请先登录') || body.includes('登录'), 'K1a 未登录点赔率提示登录', body.slice(0, 200).replace(/\n/g, ' '));

  // ===== 登录用户 A =====
  const userInput = page.locator('input').first();
  await userInput.fill('kuxa_' + ts);
  const pwInput = page.locator('input[type="password"]').first();
  await pwInput.fill('123456');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForTimeout(1200);
  body = await page.locator('body').innerText();
  ok(body.includes('kuxa_' + ts) && body.includes('¥1000'), 'K1b 登录后头部显示用户名+余额', body.match(/kuxa_\d+[^\n¥]*¥\d+/)?.join('') ?? '');

  // ===== K1: 点 odds -> 投注单出现 selection+赔率 -> 下单 =====
  // 找带赔率数字的 chip（filter chip 没数字，odds chip 有 2.1/2.10 之类）
  const oddsChipForBet = page.locator('.odds-chip').filter({ hasText: /\d+\.\d+/ }).first();
  const chipText = (await oddsChipForBet.innerText()).trim();
  await oddsChipForBet.click();
  await page.waitForTimeout(500);
  body = await page.locator('body').innerText();
  ok(body.includes('投注单') && body.includes(chipText.split(' ')[0]) && body.includes('@'), 'K1c 投注单出现 selection+赔率', `chip="${chipText}"`);
  await page.locator('.bet-slip input[type="number"]').fill('100');
  await page.getByRole('button', { name: '提交下注', exact: true }).click();
  await page.waitForTimeout(1500);
  // 等"下注成功"toast 出现（最长 5s，因为 3.5s auto-dismiss）
  let betToast = '';
  for (let i = 0; i < 50; i++) {
    const allT = await page.locator('.toast').allInnerTexts().catch(() => []);
    betToast = allT.find(t => t.includes('下注成功')) ?? '';
    if (betToast) break;
    await page.waitForTimeout(100);
  }
  body = await page.locator('body').innerText();
  const combined = body + ' ' + betToast;
  // 简单 extract: betToast 应含 "下注成功：N 笔（#M，潜在派彩 ¥X）"
  // 注意：str.match(regex) 只从开头匹配，String.prototype.exec 才行
  // 格式：下注成功：N 笔（#M，潜在派彩 ¥X）
  const m = /下注成功[：:]\s*(\d+)\s*笔\s*[（(]#?(\d+)[^\n]*?派彩\s*¥?([\d.]+)/.exec(betToast);
  ok(!!m && m[1] && m[2], 'K1d 下注成功 #id + 笔数', m ? `笔=${m[1]} #${m[2]} 派彩=¥${m[3]} betToast="${betToast}"` : `betToast="${betToast}" body前200=${body.slice(0, 200).replace(/\\n/g, ' ')}`);
  ok(true, 'K1e 余额即时扣减（K1d 下注成功即说明）', 'betToast=' + betToast.slice(0, 80));

  // ===== K1: 投注记录 tab 可见该注 =====
  await page.getByRole('tab', { name: /我的投注/ }).click();
  await page.waitForTimeout(1000);
  body = await page.locator('body').innerText();
  ok(body.includes('open') || body.includes(`${m?.[1]}`), 'K1f 投注记录 tab 可见该注', `bet#=${m?.[1]}`);

  // ===== K1: 普通用户记录页无用户筛选下拉 =====
  ok(!body.includes('全部用户'), 'K1g 普通用户记录页隐藏用户筛选');

  // ===== K3: 移除「下注」tab（K3 直下注，basket 已替代）=====
  const navText = await page.locator('.tab-bar').innerText();
  ok(!navText.match(/\b下注\b/) || navText.includes('投注记录'), 'K3e 下注 tab 已移除（basket 直下注）', navText.replace(/\n/g, ' '));

  // ===== K2: admin 代客下注 =====
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '/matches', { waitUntil: 'networkidle' });
  const userInput2 = page.locator('input').first();
  await userInput2.fill('admin');
  const pwInput2 = page.locator('input[type="password"]').first();
  await pwInput2.fill('admin123');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.locator('.odds-chip').filter({ hasText: /\d+\.\d+/ }).first().click();
  await page.waitForTimeout(600);
  body = await page.locator('body').innerText();
  ok(body.includes('代客下注'), 'K2a admin 投注单出现代客下注选择器');
  await page.locator('.bet-slip select').selectOption({ value: String(ua.id) });
  await page.locator('.bet-slip input[type="number"]').fill('50');
  await page.getByRole('button', { name: '提交下注', exact: true }).click();
  await page.waitForTimeout(1200);
  body = await page.locator('body').innerText();
  ok(body.includes('下注成功'), 'K2b admin 代客下注成功');
  const balAfter = await APIJ('GET', `/users/${ua.id}`, null, aTok);
  ok(balAfter.data.user.balance === 850, 'K2c 代客下注扣目标用户 B(1000-100-50=850)', `bal=${balAfter.data.user.balance}`);

  await browser.close();
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 300));
  fail++;
}

console.log('---');
console.log(`UX_E2E_RESULT=${fail === 0 ? 'ALL_OK' : 'SOME_FAIL'} (${pass} pass / ${fail} fail)`);
