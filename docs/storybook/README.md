---
title: Components Storybook
sidebar_position: 1
---

# 🧩 Components Storybook

> 2026-10-07 起随 **unify-frontend-expo** 重写：UI 唯一实现在 `packages/ui`（`@betting/ui`，26 组件导出），admin 面板在 `apps/mobile/src/admin/panels`（`/admin/*`），共享 hooks 在 `packages/core`（`@betting/core`）。每篇文档均对照当前源码核对。

## 分类导航

### 基础组件（packages/ui · components/）
- [theme](./components/theme.md) — ThemeProvider / useTheme / useThemeMode + tokens 双主题单一来源
- [Avatar](./components/Avatar.md) — 用户头像 fallback（hash → HSL 色 + 首字）
- [LeagueChip](./components/LeagueChip.md) — 联赛彩色 chip（hash → 稳定 HSL + 运动 emoji）
- [Badge](./components/Badge.md) — 状态徽章（statusTone 语义色映射）
- [MiniChart](./components/MiniChart.md) — SVG 折线迷你图（网格 + 渐变面积）
- [EmptyState](./components/EmptyState.md) — 空状态占位
- [Skeleton](./components/Skeleton.md) — 加载骨架屏 5 变体

### 交互组件（packages/ui · components/）
- [buttons](./components/buttons.md) — Button（渐变/幽灵/危险）+ OddsButton（涨跌闪）
- [OddsChip](./components/OddsChip.md) — 赔率筹码（选中态 + 调价闪变）
- [Modal](./components/Modal.md) — Modal + ConfirmModal（8s 自动确认倒计时）
- [Toast](./components/Toast.md) — toast 命令式 API + ToastHost（zustand，max 3）
- [layout](./components/layout.md) — Card / SectionTitle / Screen / FlashMsg / PromotionCard / Banner
- [SupportChat](./components/SupportChat.md) — 客服聊天 widget（FAQ bot + 快捷问题）

### 表单与数据（packages/ui · components/）
- [form](./components/form.md) — Input + 泛型 Select
- [table](./components/table.md) — 泛型 DataTable + TabsNav
- [markdown](./components/markdown.md) — MarkdownText 轻量富文本

### 反馈（packages/ui · components/）
- [feedback](./components/feedback.md) — OfflineBanner（全局单例）+ ErrorBoundary

### Hooks（packages/core · hooks/）
- [use-auth](./hooks/use-auth.md) — useAuth / restoreSessionAsync / setAuthStorage 持久化
- [use-bet-slip](./hooks/use-bet-slip.md) — 下注单暂存 + placeParlayItems 真串关
- [use-live-odds](./hooks/use-live-odds.md) — WS 实时赔率（指数退避 + 25s ping）
- [use-async-data](./hooks/use-async-data.md) — useAsync 与数据 hook 家族
- [keyboard-shortcuts](./hooks/keyboard-shortcuts.md) — admin 快捷键 ref 注册表（web-only）

### Admin 面板（apps/mobile/src/admin/panels · panels/）
- [MatchesExplorer](./panels/MatchesExplorer.md) — 赛事大厅（筛选 + 预设 + 虚拟滚动 + 实时赔率）
- [match-detail](./panels/match-detail.md) — 赛事详情弹窗（市场页签 + 隐含概率 + 走势图）
- [BetSlip](./panels/BetSlip.md) — 投注单（单注/真串关 + 8s 确认 + 代客下注）
- [AccountsPanel](./panels/AccountsPanel.md) — 账户管理（建用户 + 充值 + 余额）
- [MatchesAdminPanel](./panels/MatchesAdminPanel.md) — 建赛 & 市场（1x2/让球/大小）
- [SettlePanel](./panels/SettlePanel.md) — 结算（录比分 → 记录赛果 + 派彩一步完成）
- [FeedPanel](./panels/FeedPanel.md) — Feed 监控（手动拉取 + 日志）
- [BetsPanel](./panels/BetsPanel.md) — 注单列表（结算闪动 + 输赢着色）
- [SupportPanel](./panels/SupportPanel.md) — 客服工单（筛选/分页/状态流转）

## 快速链接
- [Betting Admin 主仓库](https://github.com/bandyg/betting-system)
- [CHANGELOG](https://github.com/bandyg/betting-system/blob/master/CHANGELOG.md)
- 源码：`packages/ui/src/` · `packages/core/src/` · `apps/mobile/src/admin/`
