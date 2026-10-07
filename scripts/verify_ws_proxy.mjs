// .scratch/test_ws_proxy.mjs — serve-web /ws 反代端到端验证（mock 上游，不依赖 better-sqlite3）
// 场景：mock 上游(:14110) 收到 /ws/odds 升级后回显一条消息 → 经 serve-web(:14310) 代理的客户端必须收到
import http from 'node:http';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import wsPkg from '../apps/api/node_modules/ws/index.js';
const { WebSocket, WebSocketServer } = wsPkg.WebSocketServer ? wsPkg : wsPkg.default ?? wsPkg;

const UPSTREAM = 14110;
const PROXY = 14310;

// 1) mock 上游：简单 echo WS 服务（手写握手 + 回显帧，避免再引 ws 服务端）
//    —— 直接用 ws 的 WebSocketServer 更稳（ws 包已在 api 依赖里）
const upstreamSrv = createServer();
const wss = new WebSocketServer({ noServer: true });
upstreamSrv.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/ws/')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ type: 'odds_batch', via: 'upstream' }));
      ws.on('message', (m) => ws.send(m)); // echo
    });
  } else socket.destroy();
});
await new Promise((r) => upstreamSrv.listen(UPSTREAM, r));

// 2) 起 serve-web，API_TARGET 指向 mock 上游（/ws 前缀匹配即转发）
const child = spawn(process.execPath, ['apps/mobile/scripts/serve-web.mjs', String(PROXY)], {
  cwd: process.cwd(),
  env: { ...process.env, API_TARGET: `http://127.0.0.1:${UPSTREAM}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let ready = false;
child.stdout.on('data', (d) => { if (String(d).includes('serve-web')) ready = true; });
child.stderr.on('data', (d) => process.stderr.write(`[serve-web] ${d}`));
for (let i = 0; i < 50 && !ready; i++) await sleep(100);

// 3) 客户端连代理端口，期待收到 odds_batch + echo
const results = [];
await new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PROXY}/ws/odds`);
  const timer = setTimeout(() => reject(new Error('timeout waiting messages')), 8000);
  ws.on('open', () => ws.send('ping-echo'));
  ws.on('message', (m) => {
    results.push(String(m));
    if (results.length >= 2) {
      clearTimeout(timer);
      ws.close();
      resolve();
    }
  });
  ws.on('error', reject);
});

const gotBatch = results.some((r) => r.includes('odds_batch'));
const gotEcho = results.some((r) => r.includes('ping-echo'));
console.log(gotBatch && gotEcho ? '[PASS] ws 代理双向通 + odds_batch 收到' : `[FAIL] results=${results}`);
child.kill();
upstreamSrv.close();
process.exit(gotBatch && gotEcho ? 0 : 1);
