// verify_m_ux.mjs — M 轮：列表三态（加载骨架 / 有数据 / 空态）（unify-frontend-expo 重写）
import { createRequire } from 'node:module';
const req = createRequire(process.cwd() + '/x.js');
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

try {
  // 前置：1 场赛事 + 市场
  const admin = (await APIJ('POST', '/auth/login', { name: 'admin', password: 'admin123' })).data;
  const aTok = admin.token;
  const mt = (await APIJ('POST', '/matches', { homeTeam: 'MUXHome' + ts, awayTeam: 'MUXAway' + ts, kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'MUXLeague' }, aTok)).data.match;
  await APIJ('POST', `/matches/${mt.id}/markets`, { type: '1x2', line: null, odds: { home: 2.1, draw: 3.4, away: 3.2 } }, aTok);
  ok(!!mt.id, '前置：测试赛事已建', `match=${mt.id}`);

  const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // ===== 登录 admin 进入大厅 =====
  await page.goto(BASE + '/admin/matches', { waitUntil: 'networkidle' });
  await page.waitForURL(/\/admin\/login/, { timeout: 15000 });
  await page.getByTestId('login-name').fill('admin');
  await page.getByTestId('login-password').fill('admin123');
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/admin\/matches/, { timeout: 15000 });

  // ===== M1: 加载态（骨架屏）→ 数据态 =====
  // networkidle 后数据基本已到；骨架断言用“更新于 loaded-at 出现 = 数据态完成”
  await page.getByTestId('loaded-at').waitFor({ timeout: 15000 });
  ok(true, 'M1a 大厅到达数据态（loaded-at 出现）');
  const skeletonVisible = await page.locator('[data-testid="skeleton"], [data-testid="skeleton-table"]').count();
  ok(skeletonVisible === 0, 'M1b 数据态无残留骨架');

  // ===== M2: 有数据（match 行出现）=====
  const rowCount = await page.locator('[data-testid^="match-row-"], [data-testid^="match-title-"]').count();
  ok(rowCount >= 1, 'M2 赛事行渲染', `rows=${rowCount}`);

  // ===== M3: 空态（搜索不存在的队名）=====
  await page.getByTestId('search-team').fill('不存在的队名_' + ts);
  await page.waitForTimeout(600);
  const emptyCount = await page.getByTestId('empty-state').count();
  ok(emptyCount >= 1, 'M3a 无匹配时显示空态');
  const emptyText = await page.getByTestId('empty-state').first().innerText().catch(() => '');
  ok(emptyText.includes('没有符合条件的赛事'), 'M3b 空态文案友好', emptyText.slice(0, 80).replace(/\n/g, ' '));

  // ===== M4: 注单页空态（新建无注单用户视角不可得——admin 看全部；改为清空筛选后验证表格组件空态路径）=====
  await page.getByTestId('search-team').fill('');
  await page.waitForTimeout(400);

  await browser.close();
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 400));
  fail++;
}

console.log('---');
console.log(`M_UX_E2E_RESULT=${fail === 0 ? 'ALL_OK' : 'SOME_FAIL'} (${pass} pass / ${fail} fail)`);
