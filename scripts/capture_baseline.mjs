// scripts/capture_baseline.mjs — 视觉回归 baseline 截图（unify-frontend-expo 重写，目标 :4300/admin/*）
//
// 用 Playwright 截 admin 关键页面 → docs/visual-baseline/
// 大改 UI 后跑一次重建基准；日常 PR 跑 visual_regression.mjs 对比
// 用法: BASE=http://127.0.0.1:14300 node scripts/capture_baseline.mjs
// （需先起 API + `expo export -p web` + `node apps/mobile/scripts/serve-web.mjs <port>`）

import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const req = createRequire((process.env.PW_DIR || process.cwd() + '/') + 'x.js'); // PW_DIR 兼容 bhs-4 npx cache
const { chromium } = req('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const OUT_DIR = join(root, 'docs/visual-baseline');

const BASE = process.env.BASE || 'http://127.0.0.1:14300';
const API = process.env.API || 'http://127.0.0.1:14100/api';
const VIEWPORT = { width: 1400, height: 900 };

// 8 个 admin 关键页面（login 匿名，其余 admin 角色）
const pages = [
  { url: '/admin/login', name: 'login', auth: false },
  { url: '/admin/matches', name: 'matches', auth: true },
  { url: '/admin/history', name: 'bets', auth: true },
  { url: '/admin/accounts', name: 'accounts', auth: true },
  { url: '/admin/create', name: 'matches-admin', auth: true },
  { url: '/admin/settle', name: 'settle', auth: true },
  { url: '/admin/feed', name: 'feed', auth: true },
  { url: '/admin/support', name: 'support', auth: true },
];

async function login(name, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  return (await r.json());
}

/** 幂等 seed：VRLeague 赛事 + 市场（baseline 与回归复用，避免数据差异） */
async function seed() {
  const ad = await login('admin', 'admin123');
  const aTok = ad.token;
  const lr = await fetch(`${API}/matches`, { headers: { Authorization: `Bearer ${aTok}` } });
  const ld = await lr.json();
  let m = (ld.matches || []).find((x) => x.league === 'VRLeague');
  if (!m) {
    const ts = Date.now();
    const cr = await fetch(`${API}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aTok}` },
      body: JSON.stringify({
        homeTeam: 'VRHome' + ts, awayTeam: 'VRAway' + ts,
        kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'VRLeague',
      }),
    });
    m = (await cr.json()).match;
  }
  if (m && (!m.markets || m.markets.length === 0)) {
    await fetch(`${API}/matches/${m.id}/markets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aTok}` },
      body: JSON.stringify({ type: '1x2', odds: { home: 2.1, draw: 3.4, away: 3.2 } }),
    });
  }
}

/** 注入 core 恢复登录态所需的 localStorage（betting.token + betting.currentUser）+ 冻结时间 */
async function makePage(browser, adminLogin) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addInitScript(() => {
    // 冻结 Date（踢除倒计时/时间戳导致的 baseline 漂移；须在应用 JS 运行前生效）
    const fixed = 1737158400000;
    const _Date = Date;
    window.Date = class extends _Date {
      constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
      static now() { return fixed; }
    };
  });
  if (adminLogin?.token) {
    const u = adminLogin.user ?? { id: 1, name: 'admin', role: 'admin', account_id: 1, balance: 0 };
    await ctx.addInitScript(([tok, user]) => {
      localStorage.setItem('betting.token', tok);
      localStorage.setItem('betting.currentUser', user);
    }, [adminLogin.token, JSON.stringify(u)]);
  }
  const page = await ctx.newPage();
  return { ctx, page };
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  console.log('seeding VRLeague ...');
  await seed();
  const adminLogin = await login('admin', 'admin123');

  const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE, args: ['--no-sandbox'] });
  let count = 0;
  for (const p of pages) {
    const { ctx, page } = await makePage(browser, p.auth ? adminLogin : null);
    await page.goto(`${BASE}${p.url}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    // 遮罩动态元素（更新时间戳）
    await page.addStyleTag({ content: `[data-testid="loaded-at"] { visibility: hidden !important; }` });
    await page.waitForTimeout(100);
    const out = join(OUT_DIR, `${p.name}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${p.name}.png`);
    await ctx.close();
    count++;
  }
  await browser.close();
  console.log(`\n📸 Captured ${count} baseline screenshots → ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
