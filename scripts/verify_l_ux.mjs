// verify_l_ux.mjs — L 轮：错误提示友好化（unify-frontend-expo 重写，目标 :4300/admin）
// 覆盖：匿名直达受保护页 → 门禁引导（无裸错误）；登录后数据页无 Error:；
//       token 失效 → 友好提示；toast 自动消失
import { createRequire } from 'node:module';
const req = createRequire((process.env.PW_DIR || process.cwd() + '/') + 'x.js'); // PW_DIR 兼容 bhs-4 npx cache
const { chromium } = req('playwright');

const BASE = process.env.BASE || process.argv[2] || 'http://127.0.0.1:4300';
const API = process.env.API || process.argv[3] || 'http://127.0.0.1:4100/api';
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  cond ? pass++ : fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ts = Date.now();
const APIJ = async (method, path, body, token) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

let browser = null;
try {
  // 前置：赛事 + 市场（供大厅渲染）
  const admin = (await APIJ('POST', '/auth/login', { name: 'admin', password: 'admin123' })).data;
  const aTok = admin.token;
  const mt = (await APIJ('POST', '/matches', { homeTeam: 'LUXHome' + ts, awayTeam: 'LUXAway' + ts, kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'LUXLeague' }, aTok)).data.match;
  await APIJ('POST', `/matches/${mt.id}/markets`, { type: '1x2', line: null, odds: { home: 2.1, draw: 3.4, away: 3.2 } }, aTok);
  ok(!!mt.id, '前置：测试赛事已建', `match=${mt.id}`);

  browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // ===== L1a: 匿名直达受保护页 → 门禁引导（跳登录，无裸错误）=====
  await page.goto(BASE + '/admin/history', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/admin\/login/, { timeout: 15000 });
  const loginBody = await page.locator('body').innerText();
  ok(!loginBody.includes('Error:') && !loginBody.includes('401'), 'L1a1 匿名直达 history 被引导到登录页（无裸错误）', loginBody.slice(0, 120).replace(/\n/g, ' '));
  ok(page.url().includes('/admin/login'), 'L1a2 登录页 URL 正确');

  // ===== 登录 admin =====
  await page.getByTestId('login-name').fill('admin');
  await page.getByTestId('login-password').fill('admin123');
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/admin\/history/, { timeout: 15000 });
  await page.getByTestId('panel-bets').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const betsBody = await page.locator('body').innerText();
  ok(!betsBody.includes('Error:') && betsBody.includes('投注记录'), 'L1b 登录后注单页正常加载（无 Error:）', betsBody.slice(0, 120).replace(/\n/g, ' '));

  // ===== L2: toast 出现并自动消失（保存筛选预设触发）=====
  await page.goto(BASE + '/admin/matches', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('explorer').waitFor({ timeout: 15000 });
  await page.getByTestId('preset-name-input').fill('lux_' + ts);
  await page.getByTestId('preset-name-input').press('Enter');
  await page.waitForTimeout(500);
  let toastShown = false;
  for (let i = 0; i < 30; i++) {
    const body = await page.locator('body').innerText().catch(() => '');
    if (body.includes('已保存筛选预设')) { toastShown = true; break; }
    await page.waitForTimeout(100);
  }
  ok(toastShown, 'L2a1 toast 出现（已保存筛选预设）');
  await sleep(4200);
  const afterBody = await page.locator('body').innerText().catch(() => '');
  ok(!afterBody.includes('已保存筛选预设'), 'L2a2 toast 约 3.5s 自动消失');

  // ===== L1c: token 失效（服务端 logout）→ 注单页友好提示 =====
  // 直接调 API 让 admin 的 server session 失效（前端 token 仍在 localStorage）
  const pageToken = await page.evaluate(() => localStorage.getItem('betting.token'));
  await APIJ('POST', '/auth/logout', undefined, pageToken ?? undefined);
  await page.goto(BASE + '/admin/history', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const expiredBody = await page.locator('body').innerText();
  ok(
    expiredBody.includes('登录状态已失效') || expiredBody.includes('重新登录'),
    'L1c1 token 失效显示友好提示',
    expiredBody.slice(0, 160).replace(/\n/g, ' '),
  );
  ok(!expiredBody.includes('未登录：缺少 Authorization') && !expiredBody.includes('Error:'), 'L1c2 无裸 401/错误文本');

  await browser.close();
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 400));
  fail++;
} finally {
  if (browser) await browser.close().catch(() => {});
}
process.exit(fail > 0 ? 1 : 0);

console.log('---');
console.log(`L_UX_E2E_RESULT=${fail === 0 ? 'ALL_OK' : 'SOME_FAIL'} (${pass} pass / ${fail} fail)`);
