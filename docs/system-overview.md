# System Overview — 系统构成与能力

> 回答两个问题：**这个项目有哪些系统？能完成什么？**
> 是 [README.md](../README.md) 的展开版；现状数字详见 [system-status.md](system-status.md)，实现细节详见 [architecture.md](architecture.md)。
> 基准：master `3014302`（v0.2.0）/ 2026-10-07 整理。

## 1. 一句话定位

一个类 [Amelco](https://www.amelco.co.uk/) 的体育博彩平台 **MVP**（monorepo）：覆盖**赛前 + 滚球**固定赔率投注的完整闭环 —— 赛事挂盘 → 用户下注 → 赛果结算 → 派彩到账，足球/篮球/网球/棒球等 18 个运动，三端交付（Web 运营后台 / 移动 Web / API）。面向学习与演示的轻量实现，非生产商用系统。

## 2. 总体架构：三端一库 + 外部服务

```
外部服务                用户浏览器
┌──────────┐ ┌───────────┐ ┌──────────────────────────┐
│the-odds- │ │nowpayments│ │ :4300 统一前端（Expo Web）│
│api(赔率) │ │(支付,留接口)│ │  玩家端 /  运营后台 /admin │
└────┬─────┘ └─────┬─────┘ └────────────┬─────────────┘
     │             │        /api + /ws 反代
     ▼             │                    ▼
┌──────────────────────────────────────────┐
│ api :4100 (Express + TS + better-sqlite3)│
│  · REST 19 个 route 模块 / 72+ endpoint   │
│  · WebSocket /ws/odds 实时赔率            │
│  · feed-worker: 拉赔率→入库→自动开盘/派彩  │
└──────────────────┬───────────────────────┘
                   ▼
        SQLite（schema: apps/api/src/db/schema.sql）
```

| 部分 | 位置 | 技术 | 职责 |
|---|---|---|---|
| 后端 API | `apps/api`（:4100） | Node 24 + Express 4 + TS 5.7 + better-sqlite3 | 全部业务逻辑；20 个 route 文件（19 业务 + middleware） |
| 统一前端 | `apps/mobile`（:4300） | Expo SDK 57 / React Native Web | **单一产物双角色**：玩家端 `/`（赛事/投注单/促销/我的/客服）+ 运营后台 `/admin`（角色门禁 + 8 面板）；一套代码 Web/Native 双交付 |
| 共享层 | `packages/core`、`packages/ui` | TypeScript | 统一 types、API client、hooks、useLiveOdds、存储适配器；**唯一 UI 实现**（26 组件，dark/light 双主题 tokens） |
| 数据 | `data/betting.db` | SQLite（生产 3.3MB） | users / accounts / matches / markets / bets / transactions / cms / crm / support 等 14+ 张表 |
| 部署 | `ecosystem.config.js` | pm2 3 进程 | api / web（统一前端）/ feed-worker；生产在 bhs-4（Tailscale） |

## 3. 六大业务系统

对照真实博彩公司（Amelco）划分的六个业务域，平均完成度约 85%：

| # | 系统 | 完成度 | 核心能力 |
|---|---|---|---|
| 1 | **PAM**（账户/支付/认证） | ~80% | JWT 7 天会话 + bcrypt；注册/登录/充值/提现；业务级风控限额；支付 provider 抽象（mock 已通，nowpayments 留接口未联调） |
| 2 | **Sportsbook**（核心投注） | ~85% | 18 运动；赛前 + 滚球；3 种盘口；串关；调赔/挂盘/开盘；WebSocket 实时赔率；the-odds-api live 接入 + 自动开盘 + 自动派彩 + 额度治理（≤450 req/月） |
| 3 | **CMS**（内容管理） | ~75% | 内容 CRUD；多语言；生命周期（草稿/定时/归档/恢复）；富文本 |
| 4 | **CRM**（营销/客户） | 100% | 促销/优惠券；VIP 5 级；用户偏好；分群 DSL（条件圈人群）；营销自动化；站内信群发 |
| 5 | **Data Analytics**（数据分析） | ~90% | 运营仪表盘；14 天趋势；热门 Top5；用户画像；SSE 实时大屏；CSV 导出 |
| 6 | **Customer Support**（客服） | ~80% | 工单 + 消息 + 状态机；知识库 FAQ（分类/搜索/helpful 投票）；缺邮件通知与 SLA |

**投注域细节**（系统 2 展开）：

- **盘口类型**：`1x2` 胜平负（home/draw/away）、`ah` 亚洲让球（±line）、`ou` 大小球（over/under）
- **结算规则**：赢家得 `stake × price`；输家无返还；让球整数盘恰好走盘 → 退款；串关（parlay）按腿结算，任一腿输整单 lost，全 void → refund
- **实时通道**：admin 调赔 → WebSocket hub 广播 `odds_batch` → 前端 `useLiveOdds`（自动重连 + 心跳）刷新，odds-chip 闪动提示
- **Feed 链路**：feed-worker 定时拉 the-odds-api → mapper 入库 → autoMarket 自动开盘 → 赛果回来自动 settle 派彩（env-gated 开关）

## 4. 能完成什么

### 4.1 端到端业务闭环（全流程可跑通）

1. **admin 建赛事 + 开盘**（或由 feed 从 the-odds-api 自动同步真实赔率）
2. **用户注册 / 登录**（JWT）→ **admin 充值**（或走 mock 支付通道）
3. **下注**：单注或串关；超风控限额会被拦截；下注频率受限流保护
4. **admin 录赛果 → 结算派彩**：余额变动记入 transactions（payout / refund），串关按腿结算
5. **全程数据回流分析**：仪表盘 / 趋势 / 热门 / 用户画像自动更新，可 CSV 导出

配套的运营能力同时在线：CRM 按分群 DSL 圈人发促销和站内信；客服收工单、回复、FAQ 自助；CMS 管理多语言内容并定时发布。

### 4.2 平台级保障

- **限流（R7）**：register 5/min · bet 30/min · withdraw 10/min · odds_update 60/min
- **风控**：业务级限额配置（`/risk/limits`，admin）
- **监控告警（R9）**：`monitor.ts` env-gated Webhook 通知（去抖 5min）
- **健康检查（O1）**：`/health` 对 db / redis / pg / web 真探活

## 5. 质量与工程化

三层测试金字塔（CI 承接浏览器级验证）：

| 层 | 规模 | 方式 |
|---|---|---|
| 单元测试 | 155/155（11 文件，<2s） | Node 24 原生 `--test`，零依赖（TS 直跑用 tsx） |
| 后端 e2e | 13 个 verify 脚本绿 + rate-limit 专项 | python/JS 隔离库验证（`scripts/verify_*`） |
| UI e2e | 3/3（k_ux / l_ux / m_ux） | Playwright 黑盒走查，目标 `:4300/admin`，testID 选择器 |
| 实时通道 | WebSocket 广播 PASS | `verify_websocket.mjs` + serve-web `/ws` 反代专项 |
| 视觉回归 | 8 页基线（Playwright 截图 + pixelmatch） | unify 后由 CI 首跑重建基准 |

工程化配套：GitHub Pages 就绪的 Storybook 组件画廊（unify 后标注 stale）+ 视觉基线对比页；2400+ 行文档体系（见 [DOCUMENTATION_GUIDE.md](DOCUMENTATION_GUIDE.md)）；pm2 三进程部署与运维命令。

## 6. MVP 边界（明确不做的）

- 早期结算（cashout）
- 真实支付通道联调（nowpayments 仅留接口，沙箱未跑通）
- KYC / 反洗钱 / 多商户多租户
- 多 feed 源聚合（当前仅 the-odds-api）
- 漏斗 / cohort / BI 工具对接
- 前端文案全量 i18n（CMS 已多语言，UI 文案硬编码）
- PWA 离线

当前唯一 P0 缺口：bhs-4 生产机部署 feed-scores-fix 并验证 settle 恢复（脚本已就绪）。其余缺口见 [roadmap.md](roadmap.md)。

## 7. 延伸阅读

| 想了解 | 读 |
|---|---|
| 每份文档的用途与阅读路径 | [DOCUMENTATION_GUIDE.md](DOCUMENTATION_GUIDE.md) |
| 精确现状数字与技术债 | [system-status.md](system-status.md) |
| 模块 / 数据流 / 部署架构 | [architecture.md](architecture.md) |
| 缺口分级与下个迭代 | [roadmap.md](roadmap.md) |
