// apps/api/src/wsHub.ts — WebSocket hub for real-time odds broadcasting (Sprint 4 C3)
//
// 设计目标: 后端 PUT /markets/:id/odds 后, 所有连接 ws 的客户端收到 odds_update
// - 同进程, 用 http upgrade, 单端口 (避免 CORS + port)
// - 客户端断线不报错, 服务端定期清理死连接
// - 心跳 ping/pong 30s
// - 广播: type='odds_update' { marketId, selection, price, ts }
// - 批量: 同一 tick 内多次调赔合并成一条 odds_batch 消息

import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const clients = new Set<WebSocket>();

let wss: WebSocketServer | null = null;

export function attachWsHub(server: Server): void {
  if (wss) return; // idempotent
  wss = new WebSocketServer({ server, path: '/ws/odds' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'hello', msg: 'connected', clients: clients.size, ts: Date.now() }));

    ws.on('message', (data) => {
      // 客户端发 ping/heartbeat 也接受
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        // ignore non-JSON
      }
    });

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  // Server-side heartbeat: 每 30s 给所有客户端 ping
  setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.ping(); } catch { clients.delete(ws); }
      } else {
        clients.delete(ws);
      }
    }
  }, 30_000);

  console.log('[wsHub] attached at /ws/odds');
}

type OddsChange = { selection: string; price: number };

// 批量 broadcast: 在 setImmediate 内合并多次调赔
let pending: Map<number, Map<string, number>> = new Map();
let flushScheduled = false;

export function broadcastOddsUpdate(marketId: number, changes: OddsChange[]): void {
  if (changes.length === 0) return;
  if (!pending.has(marketId)) pending.set(marketId, new Map());
  const m = pending.get(marketId)!;
  for (const c of changes) m.set(c.selection, c.price);

  if (!flushScheduled) {
    flushScheduled = true;
    setImmediate(flushOdds);
  }
}

function flushOdds(): void {
  flushScheduled = false;
  if (pending.size === 0) return;

  const updates = Array.from(pending.entries()).map(([marketId, selMap]) => ({
    marketId,
    odds: Array.from(selMap.entries()).map(([selection, price]) => ({ selection, price })),
  }));

  const msg = JSON.stringify({ type: 'odds_batch', updates, ts: Date.now() });

  let sent = 0;
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); sent++; } catch { clients.delete(ws); }
    }
  }

  pending = new Map();
  if (sent > 0) console.log(`[wsHub] broadcast odds_batch → ${sent} clients (${updates.length} markets)`);
}

// 测试用: 获取当前连接数
export function wsStats(): { clients: number } {
  return { clients: clients.size };
}
