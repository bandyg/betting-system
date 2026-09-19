// scripts/capture_baseline.mjs — 视觉回归 baseline 截图 (Sprint 5 visual regression)
//
// 用 Playwright 截所有关键页面, 保存到 docs/visual-baseline/
// 每次大改 UI 后跑: 重新 baseline
// 日常 PR 验证: 跑 visual_regression.mjs 对比
//
// 用法:
//   bhs-4 $ BASE=http://127.0.0.1:14203 node scripts/capture_baseline.mjs
//
// pages: /login, /matches, /bets, /accounts (admin), /matches-admin (admin)

import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PW_DIR = process.env.PW_DIR || '/home/bandyg/.npm/_npx/9833c18b2d85bc59/node_modules/';
const require = createRequire(PW_DIR + 'x.js');
const { chromium } = require('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const OUT_DIR = join(root, 'docs/visual-baseline');

const BASE = process.env.BASE || 'http://127.0.0.1:14203';
const API = process.env.API || 'http://127.0.0.1:14100/api';
const VIEWPORT = { width: 1400, height: 900 };

const pages = [
  { url: '/login', name: 'login', auth: false },
  { url: '/matches', name: 'matches', auth: true, role: 'user' },
  { url: '/bets', name: 'bets', auth: true, role: 'user' },
  { url: '/accounts', name: 'accounts', auth: true, role: 'admin' },
  { url: '/matches-admin', name: 'matches-admin', auth: true, role: 'admin' },
  { url: '/settle', name: 'settle', auth: true, role: 'admin' },
  { url: '/feed', name: 'feed', auth: true, role: 'admin' },
  { url: '/support', name: 'support', auth: true, role: 'admin' },
];

async function ensureUser(token, name, balance) {
  // 用 API 创建 user + deposit
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'admin', password: 'admin123' }),
  });
  const data = await res.json();
  const adminTok = data.token;
  // 找 user 或建
  const users = await (await fetch(`${API}/users`, { headers: { Authorization: `*** ${adminTok}` } })).json();
  let u = users.users.find((x) => x.name === name);
  if (!u) {
    const r = await fetch(`${API}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `*** ${adminTok}` },
      body: JSON.stringify({ name, password: '123456' }),
    });
    const d = await r.json();
    u = d.user;
  }
  // deposit
  await fetch(`${API}/users/${u.id}/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `*** ${adminTok}` },
    body: JSON.stringify({ amount: balance }),
  });
  // login as user
  const lr = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password: '123456' }),
  });
  const ld = await lr.json();
  return ld.token;
}

async function ensureMatchAndBets() {
  // 创建未来赛事 + market 让页面有数据
  const ar = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'admin', password: 'admin123' }),
  });
  const ad = await ar.json();
  const aTok = ad.token;
  const ts = Date.now();
  await fetch(`${API}/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `*** ${aTok}` },
    body: JSON.stringify({
      homeTeam: `VRHome${ts}`, awayTeam: `VRAway${ts}`,
      kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'VRLeague',
    }),
  });
  const mr = await fetch(`${API}/matches`, {
    headers: { Authorization: `*** ${aTok}` },
  });
  const md = await mr.json();
  const m = md.matches.find((x) => x.homeTeam === `VRHome${ts}`);
  await fetch(`${API}/matches/${m.id}/markets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `*** ${aTok}` },
    body: JSON.stringify({ type: '1x2', odds: { home: 2.10, draw: 3.40, away: 3.20 } }),
  });
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  // seed
  console.log('seeding data...');
  await ensureMatchAndBets();
  const userTok = await ensureUser(null, 'vruser', 1000);
  console.log('user token:', userTok ? 'OK' : 'FAIL');

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  // 注入 user token to localStorage
  await ctx.addInitScript((token) => {
    if (token) {
      localStorage.setItem('app.auth', JSON.stringify({ user: { name: 'vruser' }, token, role: 'user' }));
    }
  }, userTok);

  let count = 0;
  for (const p of pages) {
    if (p.role === 'admin') {
      // 单独 admin context
      const adminTok = await (async () => {
        const r = await fetch(`${API}/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'admin', password: 'admin123' }),
        });
        return (await r.json()).token;
      })();
      const aCtx = await browser.newContext({ viewport: VIEWPORT });
      await aCtx.addInitScript((t) => {
        localStorage.setItem('app.auth', JSON.stringify({ user: { name: 'admin' }, token: t, role: 'admin' }));
      }, adminTok);
      const page = await aCtx.newPage();
      await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);  // 等动画
      const out = join(OUT_DIR, `${p.name}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`✓ ${p.name}.png`);
      await aCtx.close();
    } else {
      const page = await ctx.newPage();
      await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const out = join(OUT_DIR, `${p.name}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`✓ ${p.name}.png`);
      await page.close();
    }
    count++;
  }
  await browser.close();
  console.log(`\n📸 Captured ${count} baseline screenshots → ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });