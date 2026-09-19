// scripts/visual_regression.mjs — 视觉回归对比 (Sprint 5 visual regression)
//
// 用 Playwright 截当前页面 + pixelmatch CLI 对比 baseline
// 输出: 总体匹配率 + 每页差异率 + diff PNG (差异区域红色高亮)
//
// 用法:
//   bhs-4 $ BASE=http://127.0.0.1:14203 node scripts/visual_regression.mjs
//   阈值: pixelmatch 0.1 (10% pixel 不匹配算 fail)
//   退出码: 0 全 PASS / 1 有 FAIL

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
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
const PIXELMATCH_THRESHOLD = '0.1';  // 10% pixel mismatch per page

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
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  return (await r.json()).token;
}

async function seed() {
  // 创建未来赛事 + 给 vruser 充钱
  const adminTok = await getToken('admin', 'admin123');
  const ts = Date.now();
  const cr = await fetch(`${API}/matches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `*** ${adminTok}` },
    body: JSON.stringify({
      homeTeam: `VR${ts}A`, awayTeam: `VR${ts}B`,
      kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'VR',
    }),
  });
  await cr.json();  // ensure response
  // 确保 vruser 存在 + 1000
  const ur = await fetch(`${API}/users`, { headers: { Authorization: `*** ${adminTok}` } });
  const ud = await ur.json();
  let u = ud.users.find((x) => x.name === 'vruser');
  if (!u) {
    const r = await fetch(`${API}/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `*** ${adminTok}` },
      body: JSON.stringify({ name: 'vruser', password: '123456' }),
    });
    u = (await r.json()).user;
  }
  await fetch(`${API}/users/${u.id}/deposit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `*** ${adminTok}` },
    body: JSON.stringify({ amount: 1000 }),
  });
}

function runPixelmatch(baseline, current, diff) {
  return new Promise((resolve) => {
    const p = spawn('pixelmatch', [
      baseline, current, diff,
      PIXELMATCH_THRESHOLD,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => out += d.toString());
    p.stderr.on('data', (d) => err += d.toString());
    p.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

async function main() {
  if (!existsSync(BASELINE_DIR)) {
    console.error(`❌ Baseline 目录不存在: ${BASELINE_DIR}`);
    console.error(`   先跑: node scripts/capture_baseline.mjs`);
    process.exit(1);
  }
  const baselines = readdirSync(BASELINE_DIR).filter((f) => f.endsWith('.png'));
  if (baselines.length === 0) {
    console.error(`❌ Baseline 目录为空`);
    process.exit(1);
  }

  if (!existsSync(DIFF_DIR)) mkdirSync(DIFF_DIR, { recursive: true });
  if (!existsSync(CURRENT_DIR)) mkdirSync(CURRENT_DIR, { recursive: true });

  console.log('seeding...');
  await seed();

  const userTok = await getToken('vruser', '123456');
  const adminTok = await getToken('admin', 'admin123');

  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  let totalPages = 0;
  let totalPassed = 0;
  let totalFailed = 0;
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
    await page.goto(`${BASE}${p.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const currentPath = join(CURRENT_DIR, `${p.name}.png`);
    await page.screenshot({ path: currentPath, fullPage: false });
    const baselinePath = join(BASELINE_DIR, `${p.name}.png`);
    const diffPath = join(DIFF_DIR, `${p.name}.png`);

    totalPages++;
    if (!existsSync(baselinePath)) {
      console.log(`⚠️  ${p.name}: baseline 缺失 (新 page)`);
      totalFailed++;
      fails.push({ page: p.name, reason: 'no baseline' });
    } else {
      const r = runPixelmatch(baselinePath, currentPath, diffPath);
      const result = await r;
      // pixelmatch exit code: 0 = match, non-zero = mismatch (返回不匹配像素数)
      const mismatched = parseInt(result.out, 10);
      if (result.code === 0 && mismatched === 0) {
        console.log(`✅ ${p.name}: 0 px diff`);
        totalPassed++;
      } else {
        const errMsg = mismatched > 0 ? `${mismatched} px diff` : `pixelmatch failed (${result.err || 'unknown'})`;
        console.log(`❌ ${p.name}: ${errMsg}`);
        totalFailed++;
        fails.push({ page: p.name, mismatched, err: result.err });
      }
    }

    await ctx.close();
  }

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log(`📸 Visual Regression — ${totalPages} pages`);
  console.log(`   ✅ PASS: ${totalPassed}`);
  console.log(`   ❌ FAIL: ${totalFailed}`);
  if (fails.length > 0) {
    console.log(`\nFailed pages:`);
    for (const f of fails) {
      console.log(`   - ${f.page}: ${f.mismatched ? f.mismatched + ' px diff' : f.reason || f.err}`);
    }
    console.log(`\nDiff images: ${DIFF_DIR}/`);
  }
  console.log('='.repeat(60));
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });