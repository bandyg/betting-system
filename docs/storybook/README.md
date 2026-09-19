---
title: Components Storybook
sidebar_position: 1
---

# 🧩 Components Storybook

**Betting Admin** — UI 组件库 + Storybook 文档

自动文档化的 React 组件，按类别分组。每页展示组件的 props、使用示例、代码片段和实际渲染效果。

## 分类导航

### 基础 (Foundation)
- [Avatar](./components/Avatar.md) — 用户头像 fallback (hash → HSL 色 + 首字)
- [LeagueChip](./components/LeagueChip.md) — 联赛彩色 chip (hash → 稳定 HSL)
- [MiniChart](./components/MiniChart.md) — SVG 折线图 (零依赖)
- [EmptyState](./components/EmptyState.md) — 空状态占位
- [Skeleton](./components/Skeleton.md) — 加载骨架屏

### 交互 (Interactive)
- [Toast / ToastHost](./components/Toast.md) — 全局 toast 通知
- [ConfirmBet](./components/ConfirmBet.md) — 下注确认弹窗
- [MatchDetail](./components/MatchDetail.md) — 赛事详情 modal
- [KeyboardHelp](./components/KeyboardHelp.md) — 快捷键帮助 modal
- [OfflineBanner](./components/OfflineBanner.md) — 离线/在线横幅
- [SupportChat](./components/SupportChat.md) — 客服聊天 widget (FAQ bot)

### 表单 (Forms)
- [LoginBar](./components/LoginBar.md) — 头部登录条
- [Tabs](./components/Tabs.md) — 主导航 tabs
- [ThemeToggle](./components/ThemeToggle.md) — 暗/亮主题切换
- [Layout](./components/Layout.md) — 全局 layout shell

### 错误处理 (Errors)
- [ErrorBoundary](./components/ErrorBoundary.md) — 顶层错误兜底

### Hooks (Custom React Hooks)
- [useKeyboard](./hooks/useKeyboard.md) — 全局键盘快捷键
- [useVirtualScroll](./hooks/useVirtualScroll.md) — 虚拟滚动
- [useApi](./hooks/useApi.md) — API 通用调用封装
- [useToast / useTheme](./hooks/useToast.md) — Store hook 封装

### Panels (业务面板)
- [BetSlip](./panels/BetSlip.md) — 投注单 (单注/组合/确认弹窗)
- [MatchesExplorer](./panels/MatchesExplorer.md) — 赛事大厅 (智能筛选 + 虚拟滚动)
- [BetsPanel](./panels/BetsPanel.md) — 我的投注 (结算动画)
- [AccountsPanel](./panels/AccountsPanel.md) — 账户管理
- [MatchesAdminPanel](./panels/MatchesAdminPanel.md) — 赛事管理
- [SettlePanel](./panels/SettlePanel.md) — 结算
- [FeedPanel](./panels/FeedPanel.md) — Feed 监控
- [SupportPanel](./panels/SupportPanel.md) — 客服工单

## 快速链接
- [Betting Admin 主仓库](https://github.com/bandyg/betting-system)
- [PRDs (Product Roadmap)](https://github.com/bandyg/betting-system/tree/master/.scratch)
- [CHANGELOG](https://github.com/bandyg/betting-system/blob/master/CHANGELOG.md)