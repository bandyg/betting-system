# BetSlip

投注单：单注 / 组合（真串关）双模式，逐注本金或统一本金，确认弹窗 8s 自动确认，admin 可代客下注。

## Props

| Prop | Type | 描述 |
|------|------|------|
| `items` | `BasketPick[]` | 当前选中的注（来自大厅 `onPick`） |
| `onRemove` | `(key: string) => void` | 移除某项 |
| `onClear` | `() => void` | 提交成功后清空 |

basket 本身由 `/admin/matches` 页面持有：同 key 再点一次即移除，**同一市场只保留一个 selection**（互斥）。

## 功能

- **模式切换**：`items.length > 1` 时才显示 `单注 / 🔗 组合` 分段按钮（默认 `single`）。
- **单注模式（perStakes）**：
  - 每注卡片展开时有独立「本金」输入，写入 `perStakes: Record<key, string>`，**未填写则回落到全局默认本金 `stake`**（默认 `100`）。
  - 卡片上实时显示 `可赢 ¥(本金 × price)`；底部另有「默认本金」输入。
  - 总投 = Σ 每注本金；潜在派彩 = Σ (本金 × 赔率)。
  - 提交：循环 `api.placeBet(uid, marketId, selection, stake)` **逐笔下单**，成功计数、失败 toast 该注信息并 `break`（已成功的保留）；全部成功后清空 basket 与 `perStakes`。
- **组合模式（真串关）**：
  - 底部显示「组合赔率」= **各注 price 连乘**（`reduce((acc, it) => acc * it.price, 1)`，`toFixed(2)`）+ 单一本金输入。
  - 总投 = 该本金；潜在派彩 = 本金 × 组合赔率。
  - 提交走 `placeParlayItems(items, stake)` → `api.placeParlay`（`POST /bets/parlay`，legs + **整单 stake** 一次提交，生成一笔真正的串关注单），toast 显示组合赔率与潜在派彩。**不是**循环下多笔单注。
- **确认弹窗**：`ConfirmModal`（`autoConfirmMs={8000}` —— 8 秒无操作自动确认下注，Esc 取消）。单注模式逐条列 `赛事 · 选项` 与 `¥本金 @ 赔率`；组合模式显示 `N 串 1（组合赔率 x.xx）`；底部汇总总投 / 可赢。
- **提交前校验**：basket 为空 / 未登录 / **admin 未选代理用户** / 任一注本金 ≤ 0，分别 toast 拦截。
- **admin 代客下注**：`role === 'admin'` 时渲染「👤 代客下注」`Select`（选项 `#id 名称(¥余额)`，来自 `api.listUsers`），实际下单 `userId = proxyUid`；非 admin 用登录人 `user.id`。提交成功后 admin 自动重拉用户列表刷新余额。
- **赔率变化闪动**：`prevPricesRef` 记录上一轮各 `key` 的 price，与新 `items` 比对，涨/跌分别记 `oddsFlash` 为 `up`/`down`（绿/红），1.2s 后清空。
- **折叠**：每注 caret 折叠（`collapsed: Record<key, boolean>`），折叠态标题单行截断。
- **快捷键**：`keyboard.registerSubmit(submit)`——`Enter` 等价于点「提交下注」。

## 主要 state

```ts
stake / perStakes{} / proxyUid / users[] / mode / collapsed{}
confirmOpen / oddsFlash{} / prevPricesRef
```

## 实际位置

- 组件：`apps/mobile/src/admin/panels/BetSlip.tsx`
- 挂载路由：`apps/mobile/src/app/admin/matches.tsx`（大厅右栏 / 窄屏列表尾部）
- API：`POST /bets`、`POST /bets/parlay`、`GET /users`
- 串关核心：`packages/core/src/hooks.ts` 的 `placeParlayItems`
