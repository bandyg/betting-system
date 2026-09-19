// scripts/visual_regression.mjs — Playwright + pixelmatch compare (Sprint 5)
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PW_DIR = process.env.PW_DIR || '/home/bandyg/.npm/_npx/9833c18b2d85bc59/node_modules/';
const require = createRequire(PW_DIR + 'x.js');
const { chromium } = require('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const BASELINE_DIR = join(root, 'docs/visual-baseline');
const DIFF_DIR = join(root, 'docs/visual-diff');
const CURRENT_DIR = join(root, 'docs/visual-current');

const BASE = process.env.BASE || 'http://127.0.0.1:14203';
const API = process.env.API || 'http://127.0.0.1:14100/api';
const VIEWPORT = { width: 1400, height: 900 };
const PIXELMATCH_THRESHOLD = '0.1';

const pages = [
  { url: '/login', name: 'login', auth: false },
  { url: '/matches', name: 'matches', auth: 'user' },
  { url: '/bets', name: 'bets', auth: 'user' },
  { url: '/accounts', name: 'accounts', auth: 'admin' },
  { url: '/matches-admin', name: 'matches-admin', auth: 'admin' },
  { url: '/settle', name: 'settle', auth: 'admin' },
  { url: '/feed', name: 'feed', auth: 'admin' },
  { url: '/support', name: 'support', auth: 'admin' },
];

async function getToken(name, password) {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  return (await r.json()).token;
}

async function seed() {
  const adminTok = await getToken('admin', 'admin123');
  const ts = Date.now();
  const cr = await fetch(API + '/matches', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminTok },
    body: JSON.stringify({
      homeTeam: 'VR' + ts + 'A', awayTeam: 'VR' + ts + 'B',
      kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'VR',
    }),
  });
  await cr.json();
  const ur = await fetch(API + '/users', { headers: { Authorization: 'Bearer ' + adminTok } });
  const ud = await ur.json();
  let u = ud.users.find((x) => x.name === 'vruser');
  if (!u) {
    const r = await fetch(API + '/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminTok },
      body: JSON.stringify({ name: 'vruser', password: '123456' }),
    });
    u = (await r.json()).user;
  }
  await fetch(API + '/users/' + u.id + '/deposit', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminTok },
    body: JSON.stringify({ amount: 1000 }),
  });
}

function runPixelmatch(baseline, current, diff) {
  return new Promise((resolve) => {
    const p = spawn('npx', ['-y', 'pixelmatch', baseline, current, diff, PIXELMATCH_THRESHOLD], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => out += d.toString());
    p.stderr.on('data', (d) => err += d.toString());
    p.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

async function main() {
  if (!existsSync(BASELINE_DIR)) {
    console.error('Baseline missing: ' + BASELINE_DIR);
    process.exit(1);
  }
  const baselines = readdirSync(BASELINE_DIR).filter((f) => f.endsWith('.png'));
  if (baselines.length === 0) { console.error('Baseline empty'); process.exit(1); }
  if (!existsSync(DIFF_DIR)) mkdirSync(DIFF_DIR, { recursive: true });
  if (!existsSync(CURRENT_DIR)) mkdirSync(CURRENT_DIR, { recursive: true });

  console.log('seeding...');
  await seed();
  const userTok = await getToken('vruser', '123456');
  const adminTok = await getToken('admin', 'admin123');

  const browser = await chromium.launch({ executablePath: '/home/bandyg/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox'] });
  let totalPages = 0, totalPassed = 0, totalFailed = 0;
  const fails = [];

  for (const p of pages) {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const tok = p.auth === 'admin' ? adminTok : p.auth === 'user' ? userTok : null;
    if (tok) {
      await ctx.addInitScript((t) => {
        const role = t.startsWith('admin') ? 'admin' : 'user';
        const name = role === 'admin' ? 'admin' : 'vruser';
        localStorage.setItem('app.auth', JSON.stringify({ user: { name }, token: t, role }));
      }, tok);
    }
    const page = await ctx.newPage();
    await page.goto(BASE + p.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    // Sprint 5 扩展: 同步遮罩 + 冻结时间戳（与 capture_baseline.mjs 一致）
    await page.addStyleTag({ content: `
      [data-test="loaded-at"] { visibility: hidden !important; }
      .odds-chip.flash-up, .odds-chip.flash-down,
      .odds-price.flash-up, .odds-price.flash-down {
        animation: none !important;
      }
    ` });
    await page.evaluate(() => {
      const fixed = 1737158400000;
      const _Date = Date;
      window.Date = class extends _Date {
        constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
        static now() { return fixed; }
      };
    });
    await page.waitForTimeout(100);
    const currentPath = join(CURRENT_DIR, p.name + '.png');
    await page.screenshot({ path: currentPath, fullPage: false });
    const baselinePath = join(BASELINE_DIR, p.name + '.png');
    const diffPath = join(DIFF_DIR, p.name + '.png');
    totalPages++;
    if (!existsSync(baselinePath)) {
      console.log('WARN ' + p.name + ': no baseline');
      totalFailed++;
      fails.push({ page: p.name, reason: 'no baseline' });
    } else {
      const result = await runPixelmatch(baselinePath, currentPath, diffPath);
      // Extract pixel diff count from output like 'different pixels: 123'
      const m = result.out.match(/different pixels:\s*(\d+)/);
      const mismatched = m ? parseInt(m[1], 10) : -1;
      if (result.code === 0 && mismatched === 0) {
        console.log('PASS ' + p.name + ': 0 px diff');
        totalPassed++;
      } else {
        const errMsg = mismatched > 0 ? (mismatched + ' px diff') : ('failed: ' + (result.err || 'unknown'));
        console.log('FAIL ' + p.name + ': ' + errMsg);
        totalFailed++;
        fails.push({ page: p.name, mismatched, err: result.err });
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log('\n' + '='.repeat(60));
  console.log('Visual Regression ' + totalPages + ' pages: PASS=' + totalPassed + ' FAIL=' + totalFailed);
  if (fails.length > 0) {
    console.log('Failed:');
    for (const f of fails) {
      console.log('  - ' + f.page + ': ' + (f.mismatched ? (f.mismatched + ' px') : (f.reason || f.err)));
    }
  }
  console.log('='.repeat(60));
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
