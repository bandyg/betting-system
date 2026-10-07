# Documentation Guide — 文档导读

> 本文件说明仓库里每一份文档的用途与适用场景，帮助读者按需索引。
> 基准：master `3014302`（v0.2.0）/ 2026-10-07 整理。

## 1. 推荐阅读路径

| 读者 | 路径 |
|---|---|
| **第一次接触本项目** | [README.md](../README.md) → [system-overview.md](system-overview.md) → [system-status.md](system-status.md) |
| **想了解实现原理** | [architecture.md](architecture.md) → 专题文档（按子系统挑） |
| **想动手开发 / 接手迭代** | [roadmap.md](roadmap.md) → [UNIT_TESTS.md](UNIT_TESTS.md) → [CHANGELOG.md](../CHANGELOG.md) |
| **运维 / 部署** | README（pm2 章节）→ [architecture.md §7](architecture.md) → [system-status.md §11](system-status.md) |
| **查单个功能怎么测的** | 专题文档（UNIT_TESTS / VISUAL_REGRESSION / WEBSOCKET_REALTIME） |

一句话总揽：**README 回答"是什么"，system-overview 回答"有哪些系统、能干什么"，system-status 回答"现在怎样"，architecture 回答"怎么实现的"，roadmap 回答"还缺什么"。**

## 2. 总览与规划类（docs/ 根，小写连字符命名）

### [system-overview.md](system-overview.md)
**做什么**：系统构成与能力总说明 —— 三端一库的整体架构、六大业务系统（PAM / Sportsbook / CMS / CRM / Data Analytics / Customer Support）各自的能力与完成度、端到端业务闭环、质量保障体系、MVP 边界。
**什么时候读**：想快速全面了解"这个项目有什么系统、能完成什么"时，作为 README 的展开版。

### [system-status.md](system-status.md)（249 行）
**做什么**：某一时间点（2026-09-26 刷新）的现状快照 —— 仓库结构、数字指标（endpoint 数 / 测试数 / 文档行数）、六大系统对照 Amelco 的完成度、16 个验证脚本覆盖清单、生产稳定性、已知技术债、部署运维命令速查。
**什么时候读**：需要精确数字或评估"现在做到哪了"。注意其时效性，以文件内标注的基准 commit 为准。

### [architecture.md](architecture.md)（339 行）
**做什么**：技术架构的权威说明 —— 顶层架构图（含 bhs-4 / Tailscale 部署拓扑）、monorepo 布局、关键请求流、数据库 schema 核心表、认证授权设计、前端架构、业务数据流、风险与限制、演进路径。
**什么时候读**：改代码前理解模块关系、数据流向，或排查跨层问题。

### [roadmap.md](roadmap.md)（311 行）
**做什么**：缺口与迭代计划 —— 22 项缺口按 P0–P3 分级，每项含背景与验收标准；附优先级矩阵和按 ROI 排序的推荐下一步（2026-09-26 更新），以及明确的"范围外（不做）"清单。
**什么时候读**：规划下个迭代、认领任务，或确认某个功能"是没做还是不打算做"。

### [customer-support-plan.md](customer-support-plan.md)（322 行）
**做什么**：客服工单系统的设计文档 —— 范围目标、数据模型、API 路由设计、前端方案、分阶段实施计划、边界与风险。是"设计先于实现"的样板文档。
**什么时候读**：维护/扩展客服系统，或为新子系统写设计文档时参考其结构。

## 3. 专题实现类（docs/ 根，大写下划线命名）

### [WEBSOCKET_REALTIME.md](WEBSOCKET_REALTIME.md)（85 行）
**做什么**：WebSocket 实时赔率功能说明 —— 后端 wsHub / 前端 useLiveOdds（自动重连 + 心跳）架构、本机与 bhs-4 上的验证步骤、监控调试方法、已知边界。
**什么时候读**：调实时推送、排查 odds_batch 收不到等问题。

### [UNIT_TESTS.md](UNIT_TESTS.md)（111 行）
**做什么**：单元测试说明 —— 10 个测试文件的位置、运行方式（Node 24 原生 `--test`，零依赖 <2s）、覆盖范围、设计原则（测什么/不测什么）、与 e2e 的分工。
**什么时候读**：写新单元测试、跑 `pnpm test:unit:single` 前了解约定。

### [VISUAL_REGRESSION.md](VISUAL_REGRESSION.md)（148 行）
**做什么**：视觉回归测试说明 —— Playwright 截图 + pixelmatch 对比 8 个关键页面的用法（baseline 生成 / 日常对比）、CI 集成方式、阈值与退出码约定。
**什么时候读**：改 UI 前后跑 `pnpm test:visual`、baseline 需要重新生成时。

### [DESIGN_TOKENS.md](DESIGN_TOKENS.md)（198 行）
**做什么**：设计系统 token 说明。⚠️ unify-frontend-expo 后部分内容已过时：token 单一来源现为 `packages/ui/src/tokens.ts`（dark/light 双主题），旧 `apps/web` CSS 变量体系已随 apps/web 删除。
**什么时候读**：新增 UI 组件或调整 dark neon 主题时（以 `packages/ui` 实际导出为准）。

## 4. docs/ 子目录

### `docs/storybook/` — 组件级文档（Markdown 故事书）
**做什么**：以 Markdown 形式文档化的组件画廊 —— [README.md](storybook/README.md) 为导航，下设三组（全部对齐 `@betting/ui` / `@betting/core` 当前实现）：
- `components/`：17 份（theme + 16 组件页，覆盖 Avatar/Badge/LeagueChip/Skeleton/DataTable/Modal/ConfirmModal/Toast/MiniChart/OddsChip/SupportChat/MarkdownText 等）
- `hooks/`：5 个 `@betting/core` hook（useAuth / useBetSlip / useLiveOdds / useAsyncData + keyboard-shortcuts）
- `panels/`：9 份 admin 面板文档（8 个 panel + MatchDetail，实现位于 `apps/mobile/src/admin/`）

**发布**：`scripts/build_pages.sh` 将 `.md` 渲染为 `.html`（marked + 页壳 + 链接改写）并拼落地页，`.github/workflows/pages.yml` 调该脚本部署 GitHub Pages（需 repo Settings → Pages 手动 enable 一次）。
**什么时候读**：查组件 props/用法与示例；新组件请同步更新此处并以 `packages/ui/src` 实际导出为准。

### `docs/visual-baseline/` — 视觉基线截图
**做什么**：8 个关键页面（login / matches / bets / accounts / settle / feed / support / matches-admin）1400×900 的基准 PNG，供 VISUAL_REGRESSION 对比。
**注意**：大改 UI 后需用 `pnpm test:visual:baseline` 重新生成，否则会误报 FAIL。

## 5. 根目录与应用内文档

### [README.md](../README.md)（根）
项目总入口：6 大系统完成度表、技术栈、快速开始、API 一览（72 endpoint 路由表）、业务闭环 curl 示例、测试与 pm2 运维命令、已知边界。**所有文档的交叉引用枢纽。**

### [CHANGELOG.md](../CHANGELOG.md)（根，20KB）
按 Keep a Changelog 格式记录版本变更（当前 0.2.0），含 Unreleased/Planned 段与 CI 状态。只记用户/运维/集成方可感知的差异。

### `apps/mobile/` 内三份
- `README.md`：Expo 脚手架默认模板（未定制，仅起服务指引）
- `AGENTS.md`：Expo v57 版本化文档指引（面向 AI 协作，写代码前必读）
- `CLAUDE.md`：仅一行 `@AGENTS.md` 引用

## 6. 与文档相关的自动化

| 文件 | 与文档的关系 |
|---|---|
| `.github/workflows/ci.yml` | CI 18 步，执行 README/UNIT_TESTS/VISUAL_REGRESSION 中描述的全部测试 |
| `.github/workflows/pages.yml` | 发布 storybook 画廊 + visual-baseline 对比页到 GitHub Pages |
| `scripts/capture_baseline.mjs` | 生成 `docs/visual-baseline/` 截图 |
| `ecosystem.config.js` | README"pm2 运维"章节对应的 4 进程定义 |

## 7. 命名约定与维护建议

**命名约定**（现状归纳）：总览/规划类用小写连字符（`system-status.md`），测试/设计专题类用大写下划线（`UNIT_TESTS.md`）。新增文档建议沿用：总览类小写、专题类大写。

**维护建议**：
- 改动影响架构或完成度时，同步刷新 `system-status.md` 并更新其基准 commit
- 大改动合入后在 `CHANGELOG.md` 记一段（用户可见变更才记）
- 新增专题功能（如新的测试层、新的实时通道）时，按专题类命名补一份对应文档，并在本导读登记
