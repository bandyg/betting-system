# useLiveOdds

实时赔率订阅 hook：WebSocket 连 `/ws/odds`，批量推送 `odds_batch`，断线指数退避重连 + 25s ping 保活。

## 功能

- **`useLiveOdds(onUpdate, enabled = true)`**
  - 连接地址由 `wsUrlFromApiBase()` 推导（默认 path `/ws/odds`）；`wsUrlFromApiBase` 抛错时（native 忘了 `setApiBase`）**静默不连**，不刷错误。
  - `onUpdate` 存在 `cbRef` 里，每次 render 同步最新闭包——回调变体不会触发重连，也不会拿到旧状态。
  - `onopen`：`retry = 0`（退避计数归零），起 `setInterval` 每 **25 秒** 发一次 `{ type: 'ping' }` 保活（仅 `readyState === OPEN` 时发送）。
  - `onmessage`：JSON 解析，仅处理 `type === 'odds_batch'` 且 `updates` 为数组的消息，回调 `OddsUpdateItem[]`；非 JSON 消息忽略。
  - `onclose`：清 ping 定时器；若非主动关闭，按 **`min(30_000, 1000 × 2^retry++)`** 指数退避重连（1s → 2s → 4s … → 封顶 30s）。
  - `onerror` → 主动 `close()` 走上面的重连路径。
  - 清理函数：置 `closed = true`、清退避与 ping 定时器、关 socket——卸载后不再重连。
  - `enabled = false` 时不建立连接（依赖数组只有 `[enabled]`）。
- **`wsUrlFromApiBase(path = '/ws/odds')`** — 由 API base 推导 WS 地址（RN 无 `window.location`，必须显式推导）：
  - 绝对 base（`http(s)://…`）：协议换 `ws/wss`，去掉结尾 `/api` 再接 path（WS 挂在服务根）。
  - 相对 base 且有 `window`（同源反代）：由页面 `location` 推导 `ws(s)://host + path`。
  - 相对 base 且无 `window`（native 未 `setApiBase`）：抛错提示。

```ts
// 用法
useLiveOdds((updates) => {
  // updates: { marketId, odds: { selection, price }[] }[]
}, enabled);
```

## 实际位置

- `packages/core/src/hooks.ts` — `useLiveOdds` / `OddsUpdateItem`
- `packages/core/src/api.ts` — `wsUrlFromApiBase` / `setApiBase` / `getApiBase`
- 消费方：`apps/mobile/src/admin/panels/MatchesExplorer.tsx`（大厅赔率实时刷新 + 涨跌闪动）
- 导出入口：`@betting/core`
