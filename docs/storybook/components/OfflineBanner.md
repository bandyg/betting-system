# OfflineBanner

顶部横幅 — 显示在线/离线状态。

## 触发
- 监听 `window.online` / `offline` 事件
- 初始值来自 `navigator.onLine`

## 行为

- 离线: 顶部黄底横幅 `⚠️ 网络已断开，部分功能可能不可用`
- 恢复: 绿底横幅 `✅ 已恢复网络连接` 2.5s 后淡出

## 渲染
`<OfflineBanner />` 自动在 Layout 渲染。

## 实际位置
`apps/web/src/components/OfflineBanner.tsx` (29 行)

## Sprint
Sprint 4 B5 (PWA)