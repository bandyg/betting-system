# SupportPanel

客服工单面板（admin/support）：筛选 + 分页 + 工单详情回复 + 状态流转。

## 功能

- **筛选**（任何一项变化都重置 `page = 1`）：
  - 状态 `Select`（`SUPPORT_STATUS_LABELS` 全量选项）
  - 分类 `Select`（`api.listSupportCategories()` 拉取，显示 `label`，按 `key` 提交）
  - 用户名 Input——**回车提交**，在已加载的 `users` 里按 `name` 精确匹配取 `userId`；匹配不到则 `undefined`（等价不过滤）
  - `↻` 手动刷新
- **分页**：`PAGE_SIZE = 10`，`←` / `→` 按钮 + `页码/总页数 · 共 N 条` 文案；首页禁 `←`、末页禁 `→`；总页数 `Math.max(1, ceil(total/PAGE_SIZE))`。
- **列表态三态**：`loading` → `SkeletonTable(rows=5, cols=6)`；空 → `EmptyState("🎫 暂无工单")`；否则 `DataTable`（`#` / 用户 / 主题单行截断 / 状态 Badge / 时间 / 「详情」）。
- **工单详情**（`openDetail` → `api.adminGetTicket(id)`）：
  - 头部：`#id · 主题` + 状态 Badge + 优先级 Badge（有才显示）。
  - 用户原帖气泡（分类标签由 `categoryLabel()` 从 categories 反查显示名）。
  - 消息流：按 `author_role` 区分——`agent` 气泡靠右、高亮边框底色；用户气泡靠左；最宽 85%。
- **回复**：`canReply = 状态不在 ['resolved','closed']` 时显示输入框（回车或「发送」提交）→ `api.adminReplyTicket` → 清空输入、重载详情、刷新列表；`busy` 期间禁发。
- **状态流转**：可迁移目标取自 `SUPPORT_STATUS_TRANSITIONS[当前状态]`，渲染成 `→ 状态名` 胶囊按钮 → `api.adminSetTicketStatus` → 重载详情 + 刷新列表；无合法迁移则不显示按钮。
- **返回**：右下「← 返回」关闭详情回到列表。
- 主要 state：`tickets`、`total`、`status`、`category`、`userName`/`userId`、`page`、`detail`、`reply`、`busy`、`loading`。

## 实际位置

- 组件：`apps/mobile/src/admin/panels/SupportPanel.tsx`
- 挂载路由：`apps/mobile/src/app/admin/support.tsx`（`/admin/support`，support 角色唯一可见 tab）
- API：`GET /admin/support/tickets`、`GET /admin/support/tickets/:id`、`POST …/:id/messages`、`PATCH …/:id/status`、`GET /support/categories`、`GET /users`
