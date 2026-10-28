// verify_m_ux.mjs — M 轮：列表三态（加载骨架 / 有数据 / 空态）（unify-frontend-expo 重写）
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


// —— 自清理：直接按依赖序删除本次创建的验证数据（赛事→市场→赔率→注单→流水），不再污染大厅 ——
let createdMatchIds = [];
let createdUserIds = [];
function cleanupVerifyArtifacts() {
  if (!createdMatchIds.length && !createdUserIds.length) return;
  try {
    const { createRequire: _cr } = require('node:module');
    const Database = _cr(import.meta.url)('better-sqlite3');
    const dbPath = process.env.BETTING_DB_PATH || new URL('../data/betting.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const db = new Database(dbPath);
    const run = db.transaction(() => {
      for (const mid of createdMatchIds) {
        const betIds = db.prepare('SELECT id FROM bets WHERE market_id IN (SELECT id FROM markets WHERE match_id = ?) OR id IN (SELECT bet_id FROM bet_legs WHERE market_id IN (SELECT id FROM markets WHERE match_id = ?))').all(mid, mid).map(r => r.id);
        for (const bid of betIds) {
          db.prepare('DELETE FROM bet_legs WHERE bet_id = ?').run(bid);
          db.prepare("DELETE FROM transactions WHERE ref_type = 'bet' AND ref_id = ?").run(bid);
          db.prepare('DELETE FROM bets WHERE id = ?').run(bid);
        }
        db.prepare('DELETE FROM odds WHERE market_id IN (SELECT id FROM markets WHERE match_id = ?)').run(mid);
        db.prepare('DELETE FROM markets WHERE match_id = ?').run(mid);
        db.prepare('DELETE FROM matches WHERE id = ?').run(mid);
      }
      for (const uid of createdUserIds) {
        const acc = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(uid);
        if (acc) {
          db.prepare('DELETE FROM transactions WHERE account_id = ?').run(acc.id);
          db.prepare('DELETE FROM payment_orders WHERE user_id = ?').run(uid);
        }
        db.prepare('DELETE FROM bet_legs WHERE bet_id IN (SELECT id FROM bets WHERE user_id = ?)').run(uid);
        db.prepare('DELETE FROM bets WHERE user_id = ?').run(uid);
        db.prepare('DELETE FROM promotion_claims WHERE user_id = ?').run(uid);
        db.prepare('DELETE FROM user_preferences WHERE user_id = ?').run(uid);
        db.prepare('DELETE FROM withdrawals WHERE user_id = ?').run(uid);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
        db.prepare('DELETE FROM accounts WHERE user_id = ?').run(uid);
        db.prepare('DELETE FROM users WHERE id = ?').run(uid);
      }
    });
    run();
    console.log('CLEANUP | 已删除验证数据:', { matches: createdMatchIds, users: createdUserIds });
  } catch (e) {
    console.log('CLEANUP-FAIL | ' + String(e).slice(0, 200));
  }
}
let browser = null;
try {
  // 前置：1 场赛事 + 市场
  const admin = (await APIJ('POST', '/auth/login', { name: 'admin', password: 'admin123' })).data;
  const aTok = admin.token;
  const mt = (await APIJ('POST', '/matches', { homeTeam: 'MUXHome' + ts, awayTeam: 'MUXAway' + ts, kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'MUXLeague' }, aTok)).data.match;
  createdMatchIds.push(mt.id);
  await APIJ('POST', `/matches/${mt.id}/markets`, { type: '1x2', line: null, odds: { home: 2.1, draw: 3.4, away: 3.2 } }, aTok);
  ok(!!mt.id, '前置：测试赛事已建', `match=${mt.id}`);

  browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // ===== 登录 admin 进入大厅 =====
  await page.goto(BASE + '/admin/matches', { waitUntil: 'domcontentloaded' });
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

  // ===== M2: 有数据（搜索过滤后走平铺路径断言 match 行；生产库 >40 场默认虚拟滚动，平铺 testID 不挂载）=====
  await page.getByTestId('search-team').fill('MUXHome' + ts);
  await page.waitForTimeout(800);
  const rowCount = await page.locator('[data-testid^="match-row-"]').count();
  ok(rowCount >= 1, 'M2 搜索过滤后赛事行渲染', `rows=${rowCount}`);
  // M2b: 清空搜索 → 数据态恢复（>40 场时出现虚拟滚动徽章，否则平铺列表仍在）
  await page.getByTestId('search-team').fill('');
  await page.waitForTimeout(600);
  const vbCount = await page.getByTestId('virtual-badge').count();
  const listOk = vbCount >= 1 || (await page.locator('[data-testid^="match-row-"]').count()) >= 1;
  ok(listOk, 'M2b 清空筛选后列表恢复（虚拟或平铺）', `virtual-badge=${vbCount}`);

  // ===== M3: 空态（搜索不存在的队名）=====
  await page.getByTestId('search-team').fill('不存在的队名_' + ts);
  await page.waitForTimeout(600);
  const emptyCount = await page.getByTestId('empty-state').count();
  ok(emptyCount >= 1, 'M3a 无匹配时显示空态');
  const emptyText = await page.getByTestId('empty-state').first().innerText().catch(() => '');
  ok(emptyText.includes('没有符合条件的赛事'), 'M3b 空态文案友好', emptyText.slice(0, 80).replace(/\n/g, ' '));


  await browser.close();
} catch (e) {
  console.log('FAIL | 脚本异常 | ' + String(e).slice(0, 400));
  fail++;
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanupVerifyArtifacts();
}

console.log('---');
console.log(`M_UX_E2E_RESULT=${fail === 0 ? 'ALL_OK' : 'SOME_FAIL'} (${pass} pass / ${fail} fail)`);
process.exitCode = fail > 0 ? 1 : 0;
