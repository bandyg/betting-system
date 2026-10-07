// scripts/visual_regression.mjs — Playwright + pixelmatch 对比（unify-frontend-expo 重写，:4300/admin/*）
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const req = createRequire(process.cwd() + '/x.js');
const { chromium } = req('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const BASELINE_DIR = join(root, 'docs/visual-baseline');
const DIFF_DIR = join(root, 'docs/visual-diff');
const CURRENT_DIR = join(root, 'docs/visual-current');

const BASE = process.env.BASE || 'http://127.0.0.1:14300';
const API = process.env.API || 'http://127.0.0.1:14100/api';
const VIEWPORT = { width: 1400, height: 900 };
const PIXELMATCH_THRESHOLD = '0.1';

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

function runPixelmatch(baseline, current, diff) {
  return new Promise((resolve) => {
    const p = spawn('npx', ['-y', 'pixelmatch', baseline, current, diff, PIXELMATCH_THRESHOLD], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
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

  console.log('seeding VRLeague ...');
  await seed();
  const adminLogin = await login('admin', 'admin123');

  const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE, args: ['--no-sandbox'] });
  let totalPages = 0, totalPassed = 0, totalFailed = 0;
  const fails = [];

  for (const p of pages) {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    await ctx.addInitScript(() => {
      const fixed = 1737158400000;
      const _Date = Date;
      window.Date = class extends _Date {
        constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
        static now() { return fixed; }
      };
    });
    if (p.auth && adminLogin.token) {
      const u = adminLogin.user ?? { id: 1, name: 'admin', role: 'admin', account_id: 1, balance: 0 };
      await ctx.addInitScript(([tok, user]) => {
        localStorage.setItem('betting.token', tok);
        localStorage.setItem('betting.currentUser', user);
      }, [adminLogin.token, JSON.stringify(u)]);
    }
    const page = await ctx.newPage();
    await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.addStyleTag({ content: `[data-testid="loaded-at"] { visibility: hidden !important; }` });
    await page.waitForTimeout(100);

    const currentPath = join(CURRENT_DIR, p.name + '.png');
    await page.screenshot({ path: currentPath, fullPage: false });
    const baselinePath = join(BASELINE_DIR, p.name + '.png');
    const diffPath = join(DIFF_DIR, p.name + '.png');
    totalPages++;
    if (!existsSync(baselinePath)) {
      console.log('WARN ' + p.name + ': no baseline（UI 变更后需重跑 capture_baseline.mjs）');
      totalFailed++;
      fails.push({ page: p.name, reason: 'no baseline' });
    } else {
      const result = await runPixelmatch(baselinePath, currentPath, diffPath);
      const m = result.out.match(/different pixels:\s*(\d+)/);
      const mismatched = m ? parseInt(m[1], 10) : -1;
      if (result.code === 0 && mismatched === 0) {
        console.log('PASS ' + p.name + ': 0 px diff');
        totalPassed++;
      } else {
        const errMsg = mismatched > 0 ? mismatched + ' px diff' : 'failed: ' + (result.err || 'unknown');
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
  for (const f of fails) {
    console.log('  - ' + f.page + ': ' + (f.mismatched ? f.mismatched + ' px' : (f.reason || f.err)));
  }
  console.log('='.repeat(60));
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
