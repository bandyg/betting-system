# Proposal

## Why

当前前端是两套独立实现：`apps/web`（React 18 + Vite + CSS，4842 行 Admin 后台，:4200）与 `apps/mobile`（Expo + RN-Web 玩家端，:4300），"dark neon" 设计系统被写了两遍（web 的 5 个 CSS 文件 + `tokens.ts` vs `packages/ui` 的 RN tokens），且两 app 已漂移（React 18.3 vs 19.2、TS 5.6 vs 6.0、react-router vs expo-router），每一次 UI 改动都要双份维护。经评审决定统一到 Expo（见 `docs/frontend-consolidation.md` 讨论，方案 B），消除双栈与重复设计系统。

## What Changes

- **管理后台并入 Expo app**：`apps/mobile` 新增 `app/admin/` 路由组，承载原 `apps/web` 的登录页 + 8 个运营面板（账户 / 建赛事 / 结算 / Feed / 客服工单 / 注单历史 / 赛事大厅 + 投注单），玩家端 5 屏不动。
- **组件与 tokens 统一进 `packages/ui`**：原 web 16 个组件迁移为 RN 实现（Table/Modal/Tabs/Badge/OddsChip/Skeleton/Toast/MiniChart(SVG) 等），tokens 合并为单一来源并支持 dark/light 双主题。
- **状态层迁移**：3 个 zustand store（auth/toast/theme）迁入 mobile，持久化从 localStorage 改为 AsyncStorage（顺带修复 JWT token 刷新后丢失的既有 bug）。
- **单一 Web 交付**：一个 `expo export` 产物同时承载玩家端与 `/admin`，`serve-web.mjs` 增加 `/ws` WebSocket 反代；pm2 从 4 进程减为 3（移除 `betting-web`）。
- **BREAKING：Admin URL 从 `:4200/*` 变为 `:4300/admin/*`**；3 个 Playwright e2e 脚本与 8 张视觉回归基线全部重定向/重生成；CI 工作流相应更新。
- **明确丢弃**（均为死代码或已在 roadmap 范围外）：未接线的 i18n 字典与语言切换、PWA Service Worker（sw.js）、`apps/web/src/api.ts` / `types.ts` / `useApi.ts` 死代码、`/bets` 空路由。
- **迁移完成后删除 `apps/web`**（git 保留历史）。

## Capabilities

### New Capabilities
- `admin-console`: 管理后台 UI —— `/admin` 路由组、角色门禁（admin/support）、8 个运营面板、实时赔率、键盘快捷键（web）、明暗主题
- `web-delivery`: 单一 Web 交付 —— 一份 Expo 静态产物承载玩家端与管理后台、`/api` + `/ws` 反代、会话持久化（token 不再随刷新丢失）
- `design-system`: 统一设计系统 —— `packages/ui` 作为两端唯一 UI 实现，单一 tokens 来源（含 dark/light）

### Modified Capabilities

（无 —— `openspec/specs/` 当前为空，本变更为首批规格）

## Impact

- **`apps/mobile`**：新增 `app/admin/` 路由组、stores、hooks；依赖增加 zustand@5、@react-native-async-storage/async-storage、react-native-svg
- **`packages/ui`**：组件从 10 个扩展到 ~26 个；tokens 重构（吸收 web `tokens.ts` 的尺寸梯度/语义色/双主题）
- **`packages/core`**：新增 WS URL 推导辅助（从 API base 推导 ws:// 地址，RN 无 `window.location`）
- **`apps/mobile/scripts/serve-web.mjs`**：增加 `/ws` WebSocket 反代（http upgrade 事件）
- **`scripts/verify_{k,l,m}_ux.mjs`**：目标 URL 改 `:4300/admin/*`，选择器优先 testID（RN-Web DOM 类名不稳定）
- **`scripts/test_{components,tokens,match_detail,i18n}.mjs`**：4 个静态分析 apps/web 源码的单元测试重定向到新位置（`test_i18n.mjs` 随 i18n 丢弃而删除）
- **`ecosystem.config.js`**：删除 `betting-web` 条目
- **`.github/workflows/ci.yml`**：Build apps/web → expo export；UI e2e / 视觉回归步骤参数更新
- **`docs/visual-baseline/`**：8 张基线截图全部重新生成（预期像素级全变，属计划内）
- **文档**：README / architecture / system-status / system-overview / DOCUMENTATION_GUIDE / storybook 文档同步更新
- **不受影响**：`apps/api` 全部 72 endpoint、`packages/core` 既有 API client 语义、玩家端 5 屏交互
