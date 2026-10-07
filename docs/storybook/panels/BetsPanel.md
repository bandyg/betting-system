# BetsPanel

投注记录面板：9 列表格 + admin 用户筛选 + 结算闪动动画 + 输赢着色。

## 功能

- **登录门禁**：未登录时不发请求，表格位置显示「⚠ 请先登录后查看投注记录」；请求返回 **401** 时同样清空列表并提示「登录状态已失效，请重新登录」（不弹错误 toast）。登录态变化（`useAuth().user`）会自动重新拉取或清空。
- **admin 用户筛选**：`user.role === 'admin'` 时才渲染 `Select`（全部用户 / `#id 名称`，选项来自 `api.listUsers`）+ 刷新按钮；非 admin 只看自己的注单（`api.listBets()` 无 `userId` 时按登录人过滤）。
- **表格 9 列**：`#` / 用户 / 市场 / 选择（`SEL_LABELS` 中文映射）/ 金额 / 赔率 / 派彩 / 状态（`Badge`）/ 时间（`fmtTime`）。
- **输赢着色**（`betOutcome` 映射）：
  - `settled` → win：派彩绿色 + `🎉`
  - `lost` → lose：派彩红色 + `💔`
  - `open` / `cancelled` → open：次要色
  - 其余（`pending` 等）→ 次要色、无图标
- **结算闪动动画**：
  - `prevBetsRef: Map<number, string>` 记住上次每个注单的 `status`。
  - 每次刷新比对：状态**从旧值变为 `settled` 或 `lost`** 的注单 id 加入 `flashIds: Set<number>`。
  - 命中的派彩单元格追加 `✨`，`setTimeout` 3 秒后把这些 id 从 `flashIds` 移除（多个批次各自定时，互不干扰）。
- 主要 state：`bets`、`users`、`userId`、`authHint`、`loading`、`flashIds`、`prevBetsRef`。

## 实际位置

- 组件：`apps/mobile/src/admin/panels/BetsPanel.tsx`
- 挂载路由：`apps/mobile/src/app/admin/history.tsx`（`/admin/history`）
- API：`GET /bets?userId=`、`GET /users`
