// verify_k_ux.mjs — K 轮：admin 大厅 UX（unify-frontend-expo 重写）
// 目标：:4300/admin/*（Expo Web + serve-web 反代），testID 选择器
// 覆盖：未登录门禁 → 普通用户拒绝 → admin 登录 → 双栏大厅 → 下注闭环（确认弹窗/倒计时）
//       → 注单历史 → 代客下注（余额 API 校验）
// 用法: node scripts/verify_k_ux.mjs [BASE] [API]   （默认 http://127.0.0.1:4300 / http://127.0.0.1:4100/api）
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
  // ===== 前置：admin 建用户 + 充 1000 + 建未来赛事/市场 =====
  const admin = (await APIJ('POST', '/auth/login', { name: 'admin', password: 'admin123' })).data;
  const aTok = admin.token;
  const ua = (await APIJ('POST', '/users', { name: 'kuxa_' + ts, password: '123456' })).data.user;
  await APIJ('POST', `/users/${ua.id}/deposit`, { amount: 1000 }, aTok);
  const mt = (await APIJ('POST', '/matches', { homeTeam: 'KUXHome' + ts, awayTeam: 'KUXAway' + ts, kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'KUXLeague' }, aTok)).data.match;
  const mk = (await APIJ('POST', `/matches/${mt.id}/markets`, { type: '1x2', line: null, odds: { home: 2.1, draw: 3.4, away: 3.2 } }, aTok)).data.market;
  ok(!!mk.id, '前置：测试赛事+市场已建', `match=${mt.id} market=${mk.id}`);

  browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // ===== K0: 未登录直达 /admin/matches → 门禁跳转 /admin/login =====
  await page.goto(BASE + '/admin/matches', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/admin\/login/, { timeout: 15000 });
  ok(true, 'K0a 未登录访问 /admin/matches 跳转登录页');

  // ===== K0b: 普通用户登录被拒（角色门禁）=====
  await page.getByTestId('login-name').fill('kuxa_' + ts);
  await page.getByTestId('login-password').fill('123456');
  await page.getByTestId('login-submit').click();
  await page.getByTestId('login-error').waitFor({ timeout: 10000 });
  const errText = await page.getByTestId('login-error').innerText();
  ok(errText.includes('无权访问'), 'K0b 普通用户登录被拒并提示角色不足', errText);

  // ===== K0c: admin 登录成功进入大厅 =====
  await page.getByTestId('login-name').fill('admin');
  await page.getByTestId('login-password').fill('admin123');
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/admin\/matches/, { timeout: 15000 });
  ok(true, 'K0c admin 登录进入大厅');
  await page.getByTestId('explorer').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);

  // ===== K3: 双栏布局（≥1100px 大厅左 + 投注单右）=====
  const slipBox = await page.getByTestId('bet-slip').boundingBox();
  const listBox = await page.getByTestId('explorer').boundingBox();
  ok(listBox && slipBox && listBox.x + listBox.width / 2 < slipBox.x, 'K3a 左列表/右投注单并排', `list.x=${listBox?.x} slip.x=${slipBox?.x}`);

  // ===== K1: 点赔率 → 投注单出现该项 =====
  const chip = page.locator('[data-testid^="odds-"]').filter({ hasText: /\d+\.\d+/ }).first();
  await chip.waitFor({ timeout: 15000 });
  await chip.click();
  await page.waitForTimeout(500);
  const slipItems = await page.locator('[data-testid^="slip-item-"]').count();
  ok(slipItems >= 1, 'K1a 点赔率加入投注单', `items=${slipItems}`);

  // ===== K1: 提交 → 确认弹窗（倒计时）→ 确认 → 成功 toast =====
  await page.getByTestId('default-stake').fill('100');
  await page.getByTestId('submit-bet').click();
  const confirm = page.getByTestId('confirm-bet');
  await confirm.waitFor({ timeout: 10000 });
  const confirmText = await confirm.innerText();
  ok(confirmText.includes('确认') && /\d+s/.test(confirmText), 'K1b 确认弹窗出现且带倒计时', confirmText.slice(0, 80).replace(/\n/g, ' '));
  await page.getByTestId('confirm-bet-ok').click();
  let betToast = '';
  for (let i = 0; i < 50; i++) {
    const all = await page.locator('body').innerText().catch(() => '');
    if (all.includes('下注成功')) { betToast = all; break; }
    await page.waitForTimeout(100);
  }
  const m = /下注成功[：:]\s*(\d+)\s*笔[^\n]*?#?(\d+)/.exec(betToast);
  ok(!!m, 'K1c 下注成功 toast（笔数+注单号）', betToast.replace(/\n/g, ' ').slice(0, 120));

  // ===== K1d: 注单历史可见该注 =====
  await page.goto(BASE + '/admin/history', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('bets-table').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const betsBody = await page.locator('body').innerText();
  ok(betsBody.includes('#' + mk.id) || betsBody.includes(String(mk.id)), 'K1d 注单历史可见该市场', `market=${mk.id}`);

  // ===== K2: admin 代客下注（选用户 → 50 → 确认）→ 余额 API 校验 =====
  await page.goto(BASE + '/admin/matches', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid^="odds-"]').filter({ hasText: /\d+\.\d+/ }).first().waitFor({ timeout: 15000 });
  await page.locator('[data-testid^="odds-"]').filter({ hasText: /\d+\.\d+/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByTestId('proxy-user-select').click();
  await page.getByTestId(`proxy-user-select-option-${ua.id}`).click();
  await page.getByTestId('default-stake').fill('50');
  await page.getByTestId('submit-bet').click();
  await page.getByTestId('confirm-bet-ok').waitFor({ timeout: 10000 });
  await page.getByTestId('confirm-bet-ok').click();
  await page.waitForTimeout(1500);
  const balAfter = await APIJ('GET', `/users/${ua.id}`, null, aTok);
  ok(balAfter.data.user?.balance === 950, 'K2a 代客下注扣目标用户余额(1000-50=950)', `bal=${balAfter.data.user?.balance}`);

  await browser.close();
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 400));
  fail++;
} finally {
  if (browser) await browser.close().catch(() => {});
}
process.exit(fail > 0 ? 1 : 0);

console.log('---');
console.log(`UX_E2E_RESULT=${fail === 0 ? 'ALL_OK' : 'SOME_FAIL'} (${pass} pass / ${fail} fail)`);
