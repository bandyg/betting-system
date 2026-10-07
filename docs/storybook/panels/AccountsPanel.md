# AccountsPanel

账户面板（admin 专）：创建用户、选用户充值、用户余额列表。

## 功能

- **创建用户**：用户名 Input + 「创建」按钮；`name` 为空先 `toast.warn('请输入用户名')`。成功后 toast 显示 `#id 名称`、清空输入、刷新列表，并**自动选中新用户**（`setSelId` + `setUser`），紧接着就能充值。
- **选用户充值**：`Select` 列出全部用户（`#id 名称`）→ 选中即 `api.getUser(id)` 拉详情；金额 Input（默认 `1000`，`decimal-pad` 键盘）+ 「充值」按钮。
  - 校验：未选用户 → `toast.warn('先选择用户')`；金额非正数 → `'金额必须大于 0'`。
  - 成功后 toast 显示新余额（`充值成功：余额 → ¥…`），同时重载该用户详情并刷新列表（余额即时更新）。
- **选中态展示**：选中后在表单下方显示 `#id 名称` + 绿色余额。
- **用户列表**：`DataTable` 三列（`#` / 名称 / 余额），余额右对齐、绿色加粗；带 loading 与空态文案「暂无用户」。
- 所有 API 错误统一 `toast.err`；面板本身不做角色校验（`/admin/*` 路由组根部已按 `admin`/`support` 角色重定向门禁）。
- 主要 state：`users`、`name`、`selId`、`user`（选中详情）、`deposit`、`loading`。

## 实际位置

- 组件：`apps/mobile/src/admin/panels/AccountsPanel.tsx`
- 挂载路由：`apps/mobile/src/app/admin/accounts.tsx`（`/admin/accounts`）
- API：`GET /users`、`POST /users`、`GET /users/:id`、`POST /users/:id/deposit`
