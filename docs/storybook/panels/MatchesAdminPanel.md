# MatchesAdminPanel

建赛 & 市场面板（admin 专）：创建赛事，再给赛事挂 1x2 / 让球 / 大小 三种市场之一。

## 功能

- **建赛事**：主队 / 客队 / 开赛时间 / sport / league 五个输入（后两个可选）+「建赛」按钮。
  - 校验：主客队名必填；开赛时间用 `new Date(kickoff)` 解析，非法则提示格式 `2026-08-20T15:00`；合法则 `toISOString()` 提交（同时带可选 `sport` / `league`）。
  - 成功 toast `创建成功：#id` 并刷新列表。
- **添加市场**：
  - `Select` 选择赛事——**只列 `status === 'scheduled'` 的赛事**（未开赛才能挂盘）。
  - 类型 Select：`1x2` 胜平负 / `ah` 让球 / `ou` 大小；非 `1x2` 时才显示 `line` 输入（校验 `Number.isFinite(line) && line !== 0`，提示「line 必须是非 0 数字」）。
  - 赔率输入：A、B 两个必填（都必须 `> 1`）；`1x2` 额外要求第三个「赔率 C(平)」。
  - 组装 odds：`1x2 → { home, draw, away }`，`ah → { home, away }`，`ou → { over, under }`。
  - 成功 toast `市场创建成功：#id` 并刷新。
- **刷新**：底部「↻ 刷新」按钮重拉赛事列表（首挂载自动拉一次）。
- 主要 state：`matches`、`home/away/kickoff/sport/league`、`mktMatch`、`mktType`、`mktLine`、`oddsA/oddsB/oddsC`。
- 错误统一 `toast.err`（信息来自 `request()` 的 `body.error`）。

## 实际位置

- 组件：`apps/mobile/src/admin/panels/MatchesAdminPanel.tsx`
- 挂载路由：`apps/mobile/src/app/admin/create.tsx`（`/admin/create`）
- API：`GET /matches`、`POST /matches`、`POST /matches/:id/markets`
