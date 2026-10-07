# FeedPanel

Feed 数据源面板（admin 专）：手动触发一次外部数据拉取，并用日志表看最近几次拉取结果。

## 功能

- **手动拉取**：`手动拉取` 按钮 → `api.ingestFeedNow()` → toast「Feed 拉取已触发」并刷新状态。`busy` 期间按钮同时 `disabled` + `loading`（显示 `⏳ 拉取中…`），防重复触发。
- **刷新状态**：`↻ 刷新` 重拉 `api.getFeedStatus()`（首挂载自动拉一次；该接口报错被静默吞掉，只表现为日志表为空）。
- **最近拉取日志**：取 `status.feedLog` 用 `DataTable` 展示 5 列：
  - 时间（`fmtTime`，`MM-DD HH:mm`）
  - 状态（`Badge`：`ok` 用成功色，其余用结算色；空显示 `—`）
  - `seen` / `upserted`（拉取到 / 实际落库的赛事数，空补 `0`）
  - `errors`（单行截断，空显示 `—`）
  - 空态文案「暂无拉取记录」，key 用 `l.id ?? index` 兜底。
- 主要 state：`status`（`FeedStatus`，含 `feedLog`）、`busy`、`loading`。

## 实际位置

- 组件：`apps/mobile/src/admin/panels/FeedPanel.tsx`
- 挂载路由：`apps/mobile/src/app/admin/feed.tsx`（`/admin/feed`）
- API：`GET /admin/feed/status`、`POST /admin/feed/ingest`
