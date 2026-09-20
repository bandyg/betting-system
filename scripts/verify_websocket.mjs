// scripts/test_websocket.mjs — WebSocket 端到端测试 (Sprint 4 C3 CI integration)
//
// 流程: admin login → 创建 match → 创建 market → PUT 调赔 → ws client 收 odds_batch
// 用法: PORT=14100 BETTING_DB_PATH=/tmp/test.db node scripts/test_websocket.mjs
//
// 用 createRequire 解析 ws (pnpm 把它装到 apps/api/node_modules, 不一定 hoist 到根)

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 从 apps/api 看 ws: ../node_modules/ws; 从根看: ./node_modules/ws
const requireApi = createRequire(path.resolve(__dirname, 'apps/api/_dummy.cjs') + '/');
const wsModule = requireApi('ws');
const WebSocket = wsModule.WebSocket ?? wsModule.default ?? wsModule;

const PORT = Number(process.env.PORT || 4100);
const API = `http://127.0.0.1:${PORT}/api`;
const WS = `ws://127.0.0.1:${PORT}/ws/odds`;
const timeout = setTimeout(() => {
  console.log('[TIMEOUT] no odds_batch in 8s');
  process.exit(2);
}, 8000);

const ws = new WebSocket(WS);

ws.on('error', (e) => {
  console.log('[FAIL] ws error:', e.message);
  clearTimeout(timeout);
  process.exit(1);
});

ws.on('open', async () => {
  console.log('[client] connected');
  try {
    // 1. admin login
    const ar = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'admin', password: 'admin123' }),
    });
    const ad = await ar.json();
    if (!ad.token) throw new Error('admin login failed: ' + JSON.stringify(ad));
    console.log('[client] admin login OK');

    // 2. create match
    const ts = Date.now();
    const mr = await fetch(`${API}/matches`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ad.token },
      body: JSON.stringify({
        homeTeam: `CI${ts}`, awayTeam: `CI${ts}B`,
        kickoffTime: '2099-01-01T12:00:00.000Z', sport: 'soccer', league: 'CI',
      }),
    });
    const md = await mr.json();
    if (!md.match?.id) throw new Error('create match failed: ' + JSON.stringify(md));
    console.log('[client] created match', md.match.id);

    // 3. create market
    const mk = await fetch(`${API}/matches/${md.match.id}/markets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ad.token },
      body: JSON.stringify({ type: '1x2', odds: { home: 1.5, draw: 2.5, away: 4.0 } }),
    });
    const mkd = await mk.json();
    if (!mkd.market?.id) throw new Error('create market failed: ' + JSON.stringify(mkd));
    console.log('[client] created market', mkd.market.id);

    // 4. PUT 调赔 → should broadcast odds_batch
    const ur = await fetch(`${API}/markets/${mkd.market.id}/odds`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ad.token },
      body: JSON.stringify({ odds: { home: 2.99 } }),
    });
    console.log('[client] PUT odds status:', ur.status);
  } catch (e) {
    console.log('[FAIL] setup error:', e.message);
    clearTimeout(timeout);
    process.exit(1);
  }
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('[client] recv:', msg.type, msg.updates ? `(${msg.updates.length} markets)` : '');
  if (msg.type === 'odds_batch' && msg.updates?.length > 0) {
    console.log('[PASS] received odds_batch');
    clearTimeout(timeout);
    ws.close();
    process.exit(0);
  }
});
