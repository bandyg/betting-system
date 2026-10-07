# useBetSlip

下注单暂存 hook：模块级单例数组跨页面共享，提交时才调 API。

## 功能

- **`useBetSlip()`** 返回 `BetSlipState`：`{ items, add, remove, clear, totalStake, potentialPayout }`。
  - 底层 `slipItems` 是模块级变量 + `slipListeners` 集合广播（与 `useCurrentUser` 同款模式），所以「大厅加注 → 投注单页看到 → 提交页清空」无需任何 Context 传参。
  - `add(item)`：按 `(marketId, selection)` 判重——**已存在则替换（视为改选），不存在则追加**；`stake` 缺省 `100`。入参 `Omit<BetSlipItem,'stake'> & { stake?: number }`。
  - `remove(marketId, selection)` / `clear()`。
  - `totalStake = Σ stake`，`potentialPayout = Σ stake × price`（逐注口径，非串关组合）。
  - 组件通过 `useState` 订阅，`add/remove/clear` 触发时拿到 `[...slipItems]` 的新数组。
- **`BetSlipItem`**：`{ marketId, selection, price, label, stake }`——label 用于提交时拼注单描述。
- **`placeBetItems(userId, items)`** — 逐单提交（单注模式）：循环 `api.placeBet(userId, marketId, selection, stake)`，串行 await，返回 `PlaceBetResult[] = { bet, balance }[]`。
- **`placeParlayItems(items, stake)`** — 真串关：把 legs（`marketId` + `selection`）连同**整单 stake** 一次提交给 `api.placeParlay`（`POST /bets/parlay`），返回单个 `PlaceBetResult`。

## 与 admin 投注单的区别

admin 侧的 `apps/mobile/src/admin/panels/BetSlip.tsx` **不用**本 hook：它由 `/admin/matches` 页面用本地 `basket: BasketPick[]` state 托管（需要同市场互斥、同 key toggle 移除等面板级逻辑）。`useBetSlip` 目前服务于 C 端：

- `apps/mobile/src/app/(tabs)/index.tsx`（大厅读 `items` 计数）
- `apps/mobile/src/app/(tabs)/slip.tsx`（用 `placeBetItems` / `placeParlayItems` 提交）

## 实际位置

- `packages/core/src/hooks.ts` — `useBetSlip` / `placeBetItems` / `placeParlayItems` / `BetSlipItem` / `BetSlipState` / `PlaceBetResult`
- `packages/core/src/api.ts` — `api.placeBet` / `api.placeParlay`
- 导出入口：`@betting/core`
