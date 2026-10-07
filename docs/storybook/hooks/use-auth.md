# useAuth / 登录态一族

管理登录态的 hooks 与持久化工具：模块级单例 + 可注入存储适配器（web localStorage 回落、native AsyncStorage 注入）。

## 功能

- **`useCurrentUser()`** — 当前用户的模块级单例 store，返回 `{ user, select, update, clear }`。
  - `currentUser` 是模块级变量（不是 Context），`listeners` 集合广播变更：任一页面 `select()` 后，其他订阅组件同步刷新（大厅选用户 → 投注页提交 → 我的页显示共用同一份状态）。
  - `select(u)` / `update(u)` 写内存后调用 `persistUser()` 落盘；`clear()` 连同存储键一起移除。
  - 初始值取自模块级单例，保证挂载即读到已恢复的登录态。
- **`useAuth()`** — 在 `useCurrentUser` 之上补密码鉴权动作，返回 `{ user, login, register, logout, update }`。
  - `login(name, password)` → `api.login` → `setAuthToken(res.token)` + `persistToken` + `select(res.user)`，返回 `User`。
  - `register(name, password)` → `api.register`（`POST /users`），后续同 login。
  - `logout()` 先 `api.logout()` 通知服务端作废 token（**失败也继续本地登出**，`.catch(() => {})`），再清 token 与用户。
- **`restoreSession()`** — 同步恢复（web 端刷新不丢登录）：已有内存态直接返回；否则读 `localStorage['betting.currentUser']`，解析成功则回填模块级 `currentUser`，并把 `betting.token` 交给 `setAuthToken`。任何异常静默忽略，返回 `null`。
- **`restoreSessionAsync()`** — 异步恢复（native）：走 `storage()`（已注入的适配器），`await getItem` 读用户与 token，逻辑与同步版一致。App 启动时调用。
- **`setAuthStorage(adapter)`** — 注入持久化适配器 `AuthStorageAdapter { getItem / setItem / removeItem }`（返回值可为 `void` 也可为 `Promise`）。查找顺序：注入的适配器 → `typeof localStorage !== 'undefined'` 时用 localStorage → 都没有则视为存储不可用（读写静默跳过，不抛错）。
- **`setAuthToken(token)` / `getAuthToken()`**（api.ts）— 模块级 `AUTH_TOKEN`；`request()` 统一附 `Authorization: Bearer <token>`，为空时不带该头。
- 存储键：`betting.currentUser`（用户 JSON）、`betting.token`（裸字符串）。
- **`resetAuthForTest()`** — 测试专用：清空用户、token、注入的适配器。

## 启动接线

```ts
// apps/mobile/src/app/_layout.tsx（模块顶层执行）
setApiBase(process.env.EXPO_PUBLIC_API_BASE ?? 'http://<host>:4100/api');
setAuthStorage(AsyncStorage);   // native 注入 AsyncStorage 适配器
void restoreSessionAsync();     // native 异步恢复
// 未注入适配器的 web 端直接 restoreSession()（同步读 localStorage）
```

## 实际位置

- `packages/core/src/hooks.ts` — `useAuth` / `useCurrentUser` / `restoreSession` / `restoreSessionAsync` / `setAuthStorage` / `resetAuthForTest`
- `packages/core/src/api.ts` — `setAuthToken` / `getAuthToken` / `request()`（带 Bearer 头）
- `apps/mobile/src/app/_layout.tsx` — 启动注入与恢复
- 导出入口：`@betting/core`
