# LoginBar

头部登录条 — 显示用户名/余额/登出。

## Props
无 — 直接读 store.ts 的 useAuth。

## 状态

- **未登录**: 显示 `🔑 登录` link
- **已登录**: 显示 `🔐 {name}（¥{balance}）role: {role}` + `登出` button
- **admin**: 可访问额外管理页

## 跳登录
点击 `🔑 登录` → 跳 `/login` 独立页（A1 Sprint 1）

## 实际位置
`apps/web/src/components/LoginBar.tsx`

## Sprint
Sprint 1 A1 (跳转) + A3 UI 优化 (admin 显示代客)