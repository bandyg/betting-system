# SettlePanel

结算面板（admin 专）：选已完赛赛事 + 录入比分 → 一次完成「记录赛果 + 结算派彩」。

## 功能

- **选赛事**：`Select` **只列 `status === 'finished'` 的赛事**（标签 `#id 主队 vs 客队`），未完赛的不可选。
- **录比分**：两个数字输入（主 : 客，默认 `1` : `0`），校验必须是**非负整数**（`Number.isInteger` 且 `>= 0`），否则 toast 提示。
- **两步合一**：`记录比分并结算` 按钮先 `api.recordResult(matchId, hs, as)`，成功后立刻 `api.settleMatch(matchId)`——中间失败会 toast 报错且不进入结算。
- **结算反馈**：toast 汇总 `总派彩 ¥…，总退款 ¥…（N 个市场）`，随后刷新赛事列表。
- **刷新**：「↻ 刷新」重拉赛事；首挂载自动拉一次。
- 主要 state：`matches`、`matchId`、`homeScore`、`awayScore`。

## 实际位置

- 组件：`apps/mobile/src/admin/panels/SettlePanel.tsx`
- 挂载路由：`apps/mobile/src/app/admin/settle.tsx`（`/admin/settle`）
- API：`GET /matches`、`POST /matches/:id/result`、`POST /matches/:id/settle`
