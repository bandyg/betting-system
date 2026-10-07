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

## 前端（unify-frontend-expo 后）

- **hook**：`packages/core/src/hooks.ts` 的 `useLiveOdds`（玩家端与 `/admin` 大厅共享）
  - 断线指数退避重连: 1s → 2s → 4s → ... max 30s；25s 客户端 ping
  - WS 地址由 `wsUrlFromApiBase()` 推导：web 同源 `ws://host/ws/odds`；native 由 `setApiBase` 绝对地址推导
- **大厅消费**：`apps/mobile/src/admin/panels/MatchesExplorer.tsx` 接收 odds_batch → 更新 matches + liveFlashes → `OddsChip`（packages/ui）1.2s 闪烁（reanimated 实现，替代旧 CSS 动画）
- **反代**：`apps/mobile/scripts/serve-web.mjs` 监听 `upgrade`，`/ws/*` 管道转发到 API_TARGET（vite proxy 的继任者）

## 测试

```bash
# 1. 启动后端 (会 attach wsHub)
PORT=4100 pnpm dev:api

# 2. 启动统一前端 (serve-web 反代 /api + /ws；需先 expo export -p web)
node apps/mobile/scripts/serve-web.mjs 4300

# 3. 浏览器打开 /admin/matches → 控制台
> ws = new WebSocket('ws://localhost:4300/ws/odds')
< {type:'hello', msg:'connected', clients:1, ts:...}

# 4. admin 调赔
> curl -X PUT http://localhost:4100/api/markets/1/odds \
    -H "Authorization: Bearer <admin-token>" \
    -d '{"odds":{"home":2.5}}'

# 5. ws 客户端收到:
< {type:'odds_batch', updates:[{marketId:1, odds:[{selection:'home',price:2.5}]}], ts:...}

# 6. 大厅 odds-chip 闪动 1.2s

# 7. 反代专项（mock 上游，无需 better-sqlite3）
node scripts/verify_ws_proxy.mjs   # → [PASS] ws 代理双向通 + odds_batch 收到
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
