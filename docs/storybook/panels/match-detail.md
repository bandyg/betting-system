# MatchDetail

赛事详情弹窗：元信息 + 市场页签 + 赔率行（隐含概率 + mock 走势图 + 加注）。

## Props

| Prop | Type | 描述 |
|------|------|------|
| `match` | `Match \| null` | 当前赛事；`null` 时组件直接 `return null`（不渲染） |
| `onClose` | `() => void` | 关闭弹窗 |
| `onPick` | `(m, mk, o) => void` | 「＋ 加注」回调（把该赔率送进投注单） |
| `loggedIn` | `boolean` | 是否登录，决定加注按钮文案与可用性 |

## 功能

- **元信息行**：状态 `Badge`（`MATCH_STATUS_LABELS`）+ 🏆 sport + 📋 league + 🕐 `fmtFull(kickoff)`；有比分时显示绿色 `比分 x : y`。
- **市场页签**：横向 `ScrollView` 的 pill 列表，标签 `TYPE_LABELS[type] @ line`。
  - 默认选中**第一个 `status === 'open'` 的市场**（没有则第一个），用户点击写 `activeMarket`。
  - 已关闭的页签 `opacity: 0.5`、`disabled`，标签追加「（已关闭）」。
  - 无市场时显示「该赛事暂无市场」。
- **赔率行表格**（表头：选项 / 赔率 / 隐含概率 / 操作）：
  - 选项名 `SEL_LABELS[selection]` + **`MiniChart` 走势图**（`mockOddsHistory(price)` 生成 24 点随机游走，**末点强制等于当前价**，仅展示用）
  - 赔率 `price.toFixed(2)`
  - 隐含概率 `1 / price × 100`（保留 1 位；`price <= 1` 显示 `—`）
  - 操作按钮三态：未登录 → `🔒 登录`（禁用）；市场关闭 → `已关闭`（禁用）；否则 `＋ 加注` → `onPick(match, market, o)`
- 底部提示「加注后, 在「投注单」可统一提交」。
- 弹窗为 `@betting/ui` 的 `Modal`（`width={560}`，自带 Esc 关闭）。

## 实际位置

`apps/mobile/src/admin/MatchDetail.tsx` —— 由 `apps/mobile/src/admin/panels/MatchesExplorer.tsx` 在点击队伍名时打开。
