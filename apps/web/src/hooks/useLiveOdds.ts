// hooks/useLiveOdds.ts — Sprint 4 C3 WebSocket 实时赔率 (frontend)
//
// 设计: 连接 ws://host/ws/odds (复用 vite proxy 转 api)
// - 自动 reconnect 退避: 1s, 2s, 4s, 8s, max 30s
// - onUpdate(marketId, [selection,price][]) 批量回调
// - 离开页面 30s 无 onUpdate 自动 ping 健康
//
// 用法:
//   useLiveOdds((marketId, updates) => {
//     // 找到 matches 里 marketId 对应的 odds, 更新 + flash
//   });

import { useEffect, useRef } from 'react';

type OddsChange = { selection: string; price: number };
type BatchUpdate = { marketId: number; odds: OddsChange[] };
type LiveOddsHandler = (updates: BatchUpdate[]) => void;

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // ws 走同一 host, vite proxy 转发到 /ws/odds → api
  return `${proto}://${window.location.host}/ws/odds`;
}

export function useLiveOdds(onUpdate: LiveOddsHandler): void {
  const handlerRef = useRef(onUpdate);
  handlerRef.current = onUpdate;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectDelay = 1000;
    let reconnectTimer: number | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        reconnectDelay = 1000; // reset backoff
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'odds_batch' && Array.isArray(msg.updates)) {
            handlerRef.current(msg.updates);
          }
        } catch {
          // ignore non-JSON
        }
      };

      ws.onclose = () => {
        if (!cancelled) scheduleReconnect();
      };
      ws.onerror = () => {
        try { ws?.close(); } catch {}
      };
    }

    function scheduleReconnect() {
      if (cancelled) return;
      if (reconnectTimer != null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        connect();
      }, reconnectDelay);
    }

    connect();

    // 健康 ping: 每 25s 发 ping, 防止 server-side ws idle close
    const pingTimer = window.setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
      }
    }, 25_000);

    return () => {
      cancelled = true;
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      try { ws?.close(); } catch {}
    };
  }, []);
}
