# Changelog

本项目的所有重要变更将记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)（尚未发布 release tag）。

> **简记法**：每段以 `(theme)` 标识主题，便于回溯。Commit SHA 在 git log 可查。
> **用户可见变更**：只记用户/运维/集成方能感知的差异；纯内部重构 / 类型修正不记。
> **CI 状态**：✅ ALL PASS (master HEAD `01e4400` 完整跑过 18 步骤：API e2e + 11 verify + health + UI e2e + unit 92/92 + visual 8/8 + WebSocket real-time odds)

## [Unreleased]

### Added（新增）
- **docs：合入 `feature/docs-system-overview`（悬置 9 天）+ 刷新至 `6d13584`**
  - system-status / architecture / roadmap 三份文档（785 行）随分支合入 master
    （此前 README/CHANGELOG 引用一直是死链）
  - 刷新过期事实：CI ✅ 18 步全绿、Sprint 5（WebSocket / tokens / Storybook / unit 92 /
    visual 8/8）、feed-scores-fix（match_feed_key + resolveScoreKeys + 额度 ≤450/月）、
    feeds 12 模块、verify 脚本 17 个
  - roadmap：R1/R2/R4/R5 标记已完成；新增 **R0（bhs-4 部署 feed 修复 + settle 恢复验证）为当前唯一 P0**
- **feed-scores-fix：比分回灌斷鏈修復 + 額度治理**
  - 根因：`FEED_SPORT_KEYS=upcoming` 模式下 scheduler 每輪對 `/v4/sports/upcoming/scores/` 打請求 →
    the-odds-api 404 UNKNOWN_SPORT（`upcoming` 只對 /odds 合法），auto-settle 斷鏈 ≥1 個月
    （feed_log 279 筆同一錯誤、production finished=0、open bets 永不結算）
  - 修法：matches 加 `match_feed_key` 欄位持久化 payload 自帶的原始 sport_key（冪等遷移 + 回填）；
    scheduler 新增 `resolveScoreKeys()`（FEED_SCORE_KEYS 覆蓋 → DB 反查 top3 → fallback）；
    scores 每 N 輪才拉（`FEED_SCORES_EVERY`，預設 2）→ 額度 ≤450 req/月（免費 500 內）
  - `deriveMarketStatus`：supplier 完賽市場 `settled:true` 由誤標 `suspended` 改正為 `settled`
    → odds 回流 completed 場次直接落 settled
  - `apps/api/scripts/backfill_feed_keys.mjs`：歷史場次 sport/league→feed key 反查回填（冪等、dry-run 預設）
  - 新增 `__verify_scores__.ts`（14 斷言：sport_key 捕獲/回填/反查/派彩/冪等）
  - pages.yml `Setup Pages` 補 `uses: actions/configure-pages@v5` + `enablement: true`
    （原 step 缺 uses 直接 fail；repo Pages 從未啟用）
- **Sprint 5 全部完成** (30+ feature, 5000+ 行代码)
  - C4 客服聊天增强（markdown + 表情 + 文件附件 + 已读）
  - C5 设计 tokens 化（reset.css + tokens.ts + DESIGN_TOKENS.md）
  - C6 Storybook（30 文件 + index.html）
  - C7 单元测试（92/92 PASS, Node --test 零依赖）
- **Visual Regression**（Sprint 5 扩展）
  - `scripts/capture_baseline.mjs` (161 行): Playwright 截 8 个关键页面 baseline
  - `scripts/visual_regression.mjs` (181 行): pixelmatch CLI 对比 baseline
  - `docs/VISUAL_REGRESSION.md` + 8 baseline PNGs committed
  - matches.png 时间戳遮罩 + 冻结 Date.now() 让 baseline 完全可重现
- **Sprint 4 C3 WebSocket 实时赔率**（backend + frontend）
  - `apps/api/src/wsHub.ts` (98 行): WebSocketServer on `/ws/odds`
  - `apps/web/src/hooks/useLiveOdds.ts` (93 行): 自动重连 + 心跳
  - MatchesExplorer 集成 WS flash 动画
  - vite proxy `/ws` 启用 WebSocket 升级 (`ws: true`)
- **CI 集成** (`.github/workflows/ci.yml`)
  - Run unit tests job
  - Visual regression job
  - WebSocket real-time odds job

### Fixed（修复）
- matches.png 时间戳 footer 导致 3892 px diff → 0 px diff (mask + 冻结 Date)
- baseline/regression 内容不一致 → idempotent seed + stable VRHome/VRAway team names
- chromium-1234 explicit executablePath (after pnpm install reset npx cache)
- ws package resolve via createRequire (pnpm not hoisted to root)

### Planned（计划中）
- **R0：bhs-4 部署 feed-scores-fix + 验证 settle 恢复**（脚本已就绪 `scripts/{deploy,verify}_feed_fix.sh`，待 bhs-4 执行；54 笔 open bets 结算 + 额度 ≤450/月达标）
- README / CHANGELOG 自动化（roadmap R10，conventional commits 解析）
- 修复 verify_analytics.py 硬编码 REF（roadmap R3，测试基线自助对账）
- 监控 / 告警（roadmap R9；feed 断链一个月才被发现是直接教训）
- 多 feed 源聚合 / 真滚球赔率（roadmap R16）

## [0.1.0] - 2026-08-15 → 2026-09-17

> 第一个可演示的 MVP 版本。从基础账户/下注闭环演进到 6 大系统 80% 完成。
> 起点：commit `90b833d` (2026-08-15) — Step 8 README + pm2 + e2e
> 终点：commit `beb39c6` (2026-09-17) — Merge feature/verify-core-routes

### Added（新增功能）

#### Auth & Session（认证与会话）
- bcrypt 密码哈希（lazy upgrade from SHA-256）
- HS256 JWT 7 天过期，session 表持久化（jti）
- login 速率限制 5 fails / 5min → 429
- 安全响应头（helmet-like middleware）
- admin role 路由保护（requireAuth / requireRole 中间件）

#### PAM（账户/支付/提现）
- 公开注册端点（`POST /users`）返回 token，自动登录
- 提现闭环：申请 → 审批 → 打款 + 限额 / 余额 / 日累计校验 + 流水入账
- 支付通道抽象 + mock 沙箱（deposit orders + signed callbacks + idempotent settlement）
- 移动端 payment UI（创建充值单 → mock pay → 余额刷新 + 订单历史）

#### Risk（风控）
- risk_limits 表 + markets.status 迁移加 suspended
- 风控校验接入 POST /bets（单笔上下限 + 赔率范围 + 日累计）
- 风控配置 API：`GET/PUT /risk/limits`（admin 配置，下注即时生效）

#### Trading Tools（交易工具）
- 调赔 `PUT /markets/:id/odds`（admin only）
- 挂盘 `POST /markets/:id/suspend` / 开盘 `POST /markets/:id/resume`
- 前端交易工具（admin 调赔/挂盘/限额配置 + 用户端超额提示 + 挂盘禁用赔率）

#### CMS（内容管理）
- 内容 CRUD（draft/publish）+ 多语言（locale 字段 + 过滤 + 前端中英切换）
- 内容生命周期（定时发布/下架/归档/恢复 + admin 管理界面）
- 内容详情页 + 富文本渲染 + 阅读量统计
- 三端共享 CMS 页面（移动端促销 tab + 公告 banner + 偏好设置）

#### CRM（营销/客户）
- 促销/优惠（promotions + claims + preferences API）
- 优惠风控（claim limits、admin approval、wagering requirements）
- VIP 等级体系（5 级阶梯 bronze/silver/gold/platinum/diamond + 累计投注升级 + 前端进度卡片）
- 用户偏好设置

#### Data Analytics（数据分析）
- 聚合模块 + admin-only 端点（dashboard / trends / hot-matches / users）
- 移动端 admin 报表 tab（仪表盘卡片 + 14 天趋势 + 热门赛事 Top5 + 用户画像 Top5）

#### Customer Support（客服工單）
- 工單后端：support_tickets / messages 表 + user/admin API + requireSupport
- 前端：core types/api/hooks + admin SupportPanel（可筛选/详情气泡/合法下一状态）
- 移动端联系客服入口 + support 页
- 设计文档：`docs/customer-support-plan.md`

#### Feed Integration（数据源接入 the-odds-api）
- P1：schema migration（external_id/source + feed_log）+ provider-agnostic mapper
- P2：upsert core w/ source isolation + the-odds-api provider client + env-gated scheduler + pm2 worker
- P3：admin 资料源管理 panel + manual/feed toggle + ingest route + feed status
- P4：feed 比分刷新 (`/scores`) + 自动派彩（幂等 settleMatch + settings.feed_auto_settle 开关）
- 多运动支持：18 运动 mapper + `FEED_SPORT_KEYS` 逗号分隔调度 + basketball/tennis mock
- `upcoming` 万能端点（1 req 全运动，免费额度友好）

#### SPORTBOOK 增强
- 多运动：sports/leagues API + matches 过滤（sport / league / status）
- 滚球：autoMarket 模块 + closed status + LIVE/CLOSED 徽标（autoSwitch 逻辑）
- Parlay 串关：accumulator betting with leg-level settlement
- admin 多运动面板：sport filter + sport/league on create match
- 移动端多运动：sport icon/badge + 横向 sport tab + 联赛分组 + 隐含概率 %

#### Web UX（admin 后台迭代）
- K 轮：tab navigation + sport pills + card layout + lobby UX v2
  - bet365 双栏 + basket 直下注 + filter 两行 + admin/support proxy betting
  - 修 POST /bets + parlay user identity 语义 + rebuild settle/feed panels
- L 轮：错误 UX 友好化
  - 投注记录匿名友好引导 + auto-dismiss msgs 3.5s + errText helper
- M 轮：match list 加载态三态分离（loading / empty / error）
- N 轮：auth production hardening（见 Auth & Session）
- O 轮：`/api/health` 真探活（web HTTP + db SELECT 1 + redis RESP + PG startup）+ 3s 单飞缓存 + 503 only on db down

#### Mobile（Expo / RN-Web）
- Expo 三端共享页面（赛事/下注单/我的）+ metro monorepo 配置
- core pages (matches/slip/account) 跨平台共享
- design system packages/ui 抽取（dark neon theme + Card/Button/OddsButton）
- reanimated deps（bounce/flash 动画）
- 修复 expo-router SSG hydration 空白（改 single SPA + Cache-Control no-cache + removeClippedSubviews）
- Expo Web 生产部署 :4300（pm2 betting-mobile-web 静态托管）

#### DevOps / 工程化
- pnpm 11 monorepo（`pnpm-workspace.yaml`：apps/* + packages/* + allowBuilds）
- pm2 ecosystem 4 进程（api / web / mobile-web / feed-worker）
- 隔离 e2e 模式（second API :14100 + BETTING_DB_PATH=/tmp/iso.db）
- .gitignore 强化（*.bak / data/*.db / node_modules / dist 等）

#### 验证（e2e 脚本）
- 16 个 `verify_*.{py,ts,mjs}` 端到端验证脚本
- 13 个绿（合计 313 PASS）：
  - verify_accounts.py 19/19
  - verify_matches.py 15/15
  - verify_markets.py 26/26
  - verify_withdrawals.py 29/29
  - verify_cms.py 39/39
  - verify_crm_risk.py 49/49
  - verify_parlay.py 39/39
  - verify_support.py 65/65
  - verify_vip.py 24/24
  - verify_auto_market.ts 13/13
  - verify_analytics.py 6/19（基线问题，见 R3）
  - verify_feeds_multisport.py 6/7（隔离 DB 空库，见 K 已知问题）
- 3 个 UI 视觉脚本（verify_k_ux / l_ux / m_ux）未在隔离环境跑过
- 1 个空文件（verify_health.mjs 0 字节）

#### 文档
- `docs/system-status.md` — 现状快照
- `docs/architecture.md` — 模块/数据/请求/部署架构
- `docs/roadmap.md` — 22 项缺口 P0-P3 + sprint 计划
- `docs/customer-support-plan.md` — 客服系统设计

### Security（安全）
- bcrypt 密码哈希（lazy upgrade from SHA-256，迁移期双算法并存）
- JWT 签名密钥随机生成并持久化到 settings 表
- login rate limiting 5/5min
- security response headers
- admin 路由角色保护（13 个敏感端点）
- 外部数据源 API key 走 `~/.betting-feed.env`（不进 git）

### Changed（变更）
- 单一用户（demo 用 userId 直传） → JWT 强制认证（除注册外所有受保护端点）
- 单一货币/单注 → 完整限额/流水体系
- 静态 admin → 角色路由 + 风控即时生效
- 单运动 → 18 运动映射 + 多运动前端切换
- 纯文档/README → 完整 docs/ 现状/架构/路线图

### Fixed（修复）
- 移动端赛事 tab 空白（expo-router SSG hydration）
- 投注记录匿名访问友好引导
- 错误消息未自动消失
- POST /bets + parlay user identity 语义
- 重复 settle 导致双倍派彩（settleMatch 幂等）

### Removed（移除）
- 老 README 末尾的 `# 本機測試 - betting-system verification` 误标
- 各种 `.bak` 备份文件（git 化 .gitignore 后已忽略）
- 单一 demo 用户（已被完整 auth 体系取代）

## 版本说明

- 0.1.0 — 第一个 MVP；6 大系统 80% 完成；13 verify全绿；3 UI 验证待跑；监控/CI/KB 缺口
- 计划 0.2.0 — 监控 + rate limit + Support 知识库（roadmap P1）
- 计划 0.3.0 — 实时分析 + CRM 分群自动化 + 审计日志（roadmap P2）
- **当前（Unreleased）** — Sprint 5 全完成 + Visual Regression 8/8 + WebSocket + CI；92 unit tests 100%；下一步走 0.2.0
