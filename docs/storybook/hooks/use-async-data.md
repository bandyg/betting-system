# useAsync 与数据 hook 家族

`useAsync` 是所有只读数据 hook 的底座：加载 + 刷新 + 错误三件套；上层按接口包了一圈业务 hook。

## 功能

- **`useAsync<T>(fn, deps = [])`** → `{ data, loading, error, refresh }`
  - `run` 用 `useCallback(fn, deps)` 包装：`deps` 变化即重新拉取（eslint 的 exhaustive-deps 被显式豁免，依赖由调用方传入的原始值决定）。
  - `run` 变化时 `useEffect` 自动首拉；初始 `loading = true`、`data = null`。
  - 成功 `setData(result)`；失败 `setError(e.message ?? String(e))`（HTTP 错误信息来自 `request()` 的 `body.error ?? 'HTTP <status>'`）；`finally` 关 loading。
  - `refresh` 就是 `run`，供手动重试/提交后刷新。
- **数据 hook 家族**（都是 `useAsync` 的薄封装，只列主要的）：

| Hook | 参数 | 接口 |
|------|------|------|
| `useMatches` | `{ sport?, league?, status? }` | `GET /matches` |
| `useSports` | — | `GET /sports` |
| `useLeagues` | `sport?` | `GET /leagues` |
| `useUsers` | — | `GET /users` |
| `useBets` | `userId?` | `GET /bets?userId=` |
| `useSupportTickets` | `{ status?, category?, page?, pageSize? }` | `GET /support/tickets` |
| `useWithdrawals` | `{ all?, status? }` | `GET /withdrawals` |
| `useContents` / `usePromotions` / `useClaims` | 状态筛选 | CMS / CRM 列表 |
| `usePreferences` / `useMyVip` / `useRiskLimits` | 部分需 `userId` | 用户偏好 / VIP / 风控 |
| `useAnalyticsDashboard` / `useAnalyticsTrends` / `useAnalyticsHotMatches` / `useAnalyticsUsers` | `days` / `limit` | 分析看板四接口 |

- 空值防护：`useClaims(promotionId)`、`usePreferences(userId)` 在 id 为空时**不发请求**，直接 resolve 占位对象（`{ count: 0, claims: [] }` / 默认偏好），避免无意义 404。
- 分页类 hook 的 `deps` 只取标量（如 `useSupportTickets` 取 `status/category/page/pageSize`），传对象不会造成无限重拉。

## 说明

- 这套 hook 偏 C 端与展示型页面；admin 面板（AccountsPanel、SettlePanel、SupportPanel 等）为了在操作后精确控制「刷新哪个列表 / 是否 toast 错误」，多数直接调 `api.*` 并自管 `useState`，只在少数地方用数据 hook。
- `useAsync` 不做请求竞态取消：快速切换筛选时以最后一次 `run` 的结果为准（`setData` 在 await 后执行）。

## 实际位置

- `packages/core/src/hooks.ts` — `useAsync` 及全部数据 hook
- `packages/core/src/api.ts` — 底层 `request()` / `api.*`
- 导出入口：`@betting/core`
