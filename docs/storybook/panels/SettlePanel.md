# SettlePanel

结算面板 (admin only) — 触发已结束赛事的结算。

## 功能

- 列出 in_progress + finished 赛事
- 选择赢方（home/draw/away）
- 触发结算 → 后端自动更新 bets status + 派彩到 user balance
- 结算后 BetsPanel 显示 🎉 图标

## 实际位置
`apps/web/src/panels/SettlePanel.tsx`