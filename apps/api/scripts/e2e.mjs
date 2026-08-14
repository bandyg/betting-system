#!/usr/bin/env node
/**
 * Betting System 端到端验证脚本
 * 覆盖：health → 建用户 → 充值 → 建赛 → 建市场(1x2/ah/ou) → 下注 → 余额扣减
 *       → 录赛果 → 结算 → 派彩余额断言 + 负例（余额不足/非法选择/用户不存在/重复结算）
 * 用法：node apps/api/scripts/e2e.mjs   （从仓库根目录运行）
 * 说明：每次运行用时间戳后缀隔离测试数据，可重复执行。
 */
const BASE = process.env.API_BASE ?? 'http://localhost:4100/api';

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`✅ ${name} — ${detail ?? ''}`); }
  else { failed++; console.log(`❌ ${name} — ${detail ?? ''}`); }
}

const suffix = new Date().toISOString().slice(11, 19).replace(/:/g, '');

// 0. health（在根路径，无 /api 前缀）
const hRes = await fetch((BASE.endsWith('/api') ? BASE.slice(0, -4) : BASE) + '/health');
const hBody = await hRes.json().catch(() => null);
check('health ok', hRes.status === 200 && hBody?.status === 'ok', JSON.stringify(hBody));

// 1. 用户
const r1 = await call('POST', '/users', { name: `e2e_a_${suffix}` });
const r2 = await call('POST', '/users', { name: `e2e_b_${suffix}` });
const uid1 = r1.body?.user?.id, uid2 = r2.body?.user?.id;
check('创建用户 A/B', r1.status === 201 && r2.status === 201 && uid1 && uid2, `id=${uid1},${uid2}`);

// 2. 充值
const d1 = await call('POST', `/users/${uid1}/deposit`, { amount: 1000 });
const d2 = await call('POST', `/users/${uid2}/deposit`, { amount: 1000 });
check('充值 1000', d1.status === 200 && d2.status === 200
  && d1.body?.account?.balance === 1000 && d2.body?.account?.balance === 1000,
  `A=${d1.body?.account?.balance} B=${d2.body?.account?.balance}`);

// 3. 建赛
const m = await call('POST', '/matches', {
  homeTeam: `E2E Home ${suffix}`, awayTeam: `E2E Away ${suffix}`,
  kickoffTime: '2026-08-20T19:00:00Z',
});
const mid = m.body?.match?.id;
check('建赛事', m.status === 201 && mid, `match id=${mid}`);

// 4. 建市场
const k1 = await call('POST', `/matches/${mid}/markets`, { type: '1x2', odds: { home: 2.10, draw: 3.40, away: 3.20 } });
const k2 = await call('POST', `/matches/${mid}/markets`, { type: 'ah', line: -1.5, odds: { home: 1.85, away: 2.05 } });
const k3 = await call('POST', `/matches/${mid}/markets`, { type: 'ou', line: 2.5, odds: { over: 1.90, under: 1.95 } });
const id1 = k1.body?.market?.id, id2 = k2.body?.market?.id, id3 = k3.body?.market?.id;
check('建 3 市场', k1.status === 201 && k2.status === 201 && k3.status === 201, `ids=${id1},${id2},${id3}`);

// 5. 下注
const b1 = await call('POST', '/bets', { userId: uid1, marketId: id1, selection: 'home', stake: 100 });
check('下注 A 主胜 100', b1.status === 201 && b1.body?.bet?.potential_payout === 210,
  `payout=${b1.body?.bet?.potential_payout}`);
const b2 = await call('POST', '/bets', { userId: uid2, marketId: id3, selection: 'over', stake: 100 });
check('下注 B 大球 100', b2.status === 201, `bet id=${b2.body?.bet?.id}`);

// 6. 余额扣减
const a1 = await call('GET', `/users/${uid1}`);
const a2 = await call('GET', `/users/${uid2}`);
check('下注后余额 900/900', a1.body?.user?.balance === 900 && a2.body?.user?.balance === 900,
  `A=${a1.body?.user?.balance} B=${a2.body?.user?.balance}`);

// 7. 录赛果 2:1（主胜 + 大球 + ah -1.5 全赢）
const rr = await call('POST', `/matches/${mid}/result`, { homeScore: 2, awayScore: 1 });
check('录赛果 2:1', rr.status === 200 && rr.body?.match?.status === 'finished',
  `status=${rr.body?.match?.status}`);

// 8. 结算
const s = await call('POST', `/matches/${mid}/settle`);
check('结算', s.status === 200 && s.body?.match?.status === 'settled',
  `status=${s.body?.match?.status}`);

// 9. 结算后余额：A 1110（赢 210）、B 1090（赢 190）
const sa1 = await call('GET', `/users/${uid1}`);
const sa2 = await call('GET', `/users/${uid2}`);
check('结算后余额 A=1110 B=1090',
  sa1.body?.user?.balance === 1110 && sa2.body?.user?.balance === 1090,
  `A=${sa1.body?.user?.balance}(期望1110) B=${sa2.body?.user?.balance}(期望1090)`);

// 10. 负例：新建未结算赛事验证
const nm = await call('POST', '/matches', {
  homeTeam: `Neg H ${suffix}`, awayTeam: `Neg A ${suffix}`, kickoffTime: '2026-08-21T19:00:00Z',
});
const nmid = nm.body?.match?.id;
const nk = await call('POST', `/matches/${nmid}/markets`, { type: '1x2', odds: { home: 2.0, draw: 3.0, away: 3.0 } });
const nkId = nk.body?.market?.id;
const n1 = await call('POST', '/bets', { userId: uid1, marketId: nkId, selection: 'home', stake: 99999 });
check('负例-余额不足', n1.status === 400 && String(n1.body?.error).includes('insufficient'), JSON.stringify(n1.body));
const n2 = await call('POST', '/bets', { userId: uid1, marketId: nkId, selection: 'bogus', stake: 10 });
check('负例-非法选择', n2.status === 400, JSON.stringify(n2.body));
const n3 = await call('POST', '/bets', { userId: 999999, marketId: nkId, selection: 'home', stake: 10 });
check('负例-用户不存在', n3.status === 404, JSON.stringify(n3.body));
const n4 = await call('POST', `/matches/${mid}/settle`);
check('负例-重复结算', n4.status === 409, JSON.stringify(n4.body));

console.log(`\n===== 汇总: ${passed}/${passed + failed} PASS =====`);
process.exit(failed > 0 ? 1 : 0);
