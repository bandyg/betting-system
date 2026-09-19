# Sprint 4 C3 — WebSocket 实时赔率 (Sprint 5 扩展)

**Sprint 4 C3 实时赔率更新**: 后端 PUT 调赔 → 所有 ws 客户端毫秒级收到 odds_batch。

## 架构

```
┌──────────────┐    PUT /api/markets/:id/odds    ┌─────────────┐
│ Admin Panel  │ ─────────────────────────────▶ │             │
└──────────────┘                                │             │
                                                │  Express    │
┌──────────────┐    WebSocket /ws/odds          │  + wsHub    │
│ User Matches │ ◀═══════════════════════════  │             │
│   (frontend) │  odds_batch broadcast          │             │
└──────────────┘                                └─────────────┘
       ↓
  flash-up/flash-down
  CSS animation (1.2s)
```

## 后端 (`apps/api/src/`)

- **`wsHub.ts`** (97 行): WebSocketServer on `/ws/odds`
  - 客户端连接收 `{type:'hello', clients, ts}`
  - 客户端发 `{type:'ping'}` → 回 `{type:'pong'}`
  - 服务端心跳 30s ping 清理死连接
  - `broadcastOddsUpdate(marketId, [{selection,price}])`: setImmediate 合并同 tick 多笔调赔 → 1 条 `odds_batch` 消息

- **`routes/markets.ts`**: PUT `/markets/:id/odds` 调赔成功后调用 `broadcastOddsUpdate`

- **`index.ts`**: 用 `createServer(app)` 包 express, `attachWsHub(httpServer)` 共享端口

## 前端 (`apps/web/src/`)

- **`hooks/useLiveOdds.ts`** (89 行):
  - `useEffect` 启动连接
  - 断线指数退避重连: 1s → 2s → 4s → 8s → ... max 30s
  - 25s 客户端 ping 防止 server-side idle close
  - cleanup 时关闭连接

- **`panels/MatchesExplorer.tsx`**:
  - `useLiveOdds((updates) => {...})` 接收 odds_batch
  - 找到 marketId 对应的 odds，更新 `matches` state + 设置 `liveFlashes[chipKey]`
  - 1.2s 后清除 flash
  - `odds-chip` className 加 `flash-up`/`flash-down` 触发 CSS 动画

- **`vite.config.ts`**:
  - `/api` 与 `/ws` 都用 `apiProxy` 配置 (`ws: true` 启用 WebSocket 升级转发)

## 测试 (本机 + bhs-4)

```bash
# 1. 启动后端 (会 attach wsHub)
PORT=4100 pnpm dev:api

# 2. 启动前端 (vite proxy 转发 /ws)
cd apps/web && VITE_API_TARGET=http://localhost:4100 pnpm dev

# 3. 浏览器打开 /matches → 控制台
> ws = new WebSocket('ws://localhost:4200/ws/odds')
< {type:'hello', msg:'connected', clients:1, ts:...}

# 4. admin 调赔
> curl -X PUT http://localhost:4100/api/markets/1/odds \
    -H "Authorization: Bearer <admin-token>" \
    -d '{"odds":{"home":2.5}}'

# 5. ws 客户端收到:
< {type:'odds_batch', updates:[{marketId:1, odds:[{selection:'home',price:2.5}]}], ts:...}

# 6. matches 页面 odds-chip 闪动 1.2s
```

## 监控 + 调试

- **状态**: 服务端启动 log `[wsHub] attached at /ws/odds`
- **广播 log**: `[wsHub] broadcast odds_batch → N clients (M markets)` (N>0 时打印)
- **客户端健康**: `window.__getWsState()` 不暴露; 直接 devtools 看 network ws frame
- **断线重连**: `useEffect` cleanup + reconnectDelay 退避

## 已知边界

- 单进程 wsHub, 不支持多实例 broadcast (需 Redis pubsub 或 sticky session, 留作未来)
- `ws://` 走明文; 生产应 `wss://` (TLS terminator 在 nginx)
- 仅 broadcast odds_batch; future: bets_update / match_status_change
