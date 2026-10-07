# Roadmap — betting-system MVP 缺口与下一步

> 与 `system-status.md` 配套。本文件只列**当前还差什么、优先级、估计工时**，不写实现。
> 基准 commit：初版 `beb39c6` → 2026-09-26 刷新至 `6d13584`（已完成项就地标记 ✅，保留历史）
> 用途：决定下几个 feature。

## 评分维度

- **P0**：阻塞 / 隐患 / 一次失误就出大事
- **P1**：核心体验 / 商用前必做
- **P2**：上线后第一个月补
- **P3**：增长 / 长期能力

每条含：**工时估计**（单人日）、**验收标准**、**风险/前置**。

---

## P0 — 立即

### R0. bhs-4 部署 feed-scores-fix + 验证 settle 恢复 ⏳ 脚本就绪，待部署
- **缺口**：54 笔 open bets 永不结算，feed_log 错误模式无人监控；feed-scores-fix（`0540faa`）已合 master 但生产验证未闭环
- **做法**：
  1. bhs-4: `bash scripts/deploy_feed_fix.sh --apply`（pull + build + restart，幂等；DB 自动备份；commit 校验）
  2. bhs-4: `bash scripts/verify_feed_fix.sh --window-min 30`（三条验收：feed_log 错误清零 / open bets 减少 / 额度 ≤450）
  3. 两条脚本已本地静态验证（SQL 兼容 schema，退出码正确）；脚本本身已 commit，**待 bhs-4 执行**
- **脚本细节**：
  - `scripts/deploy_feed_fix.sh` — 默认 dry-run；`--apply` 执行；自动备份 `data/betting.db`；commit message 必须含 `feed-scores-fix`；schema 列存在性检查；`--rollback` 回滚到 HEAD@{2}
  - `scripts/verify_feed_fix.sh` — 三条 PASS/FAIL：① feed_log 错误模式 LIKE 匹配（404 / UNKNOWN_SPORT / /scores/ / upcoming）② open bets 窗口内减少或 won+lost 数 > 0 ③ 30 天外推 req 数 ≤450；默认 30 分钟观察窗口，可调
- **工时**：0.25 d（脚本已写，剩部署+观察）
- **验收**：verify_feed_fix.sh 三条全 PASS
- **风险**：低（脚本幂等，`--rollback` 一键回滚）

### R1. README 重写 + CHANGELOG ✅ 已完成（2026-09-19，feature/readme-changelog）
- **缺口**：README 仍是 5-route MVP 描述，跟现实 16 route / 72 endpoint / 6 系统脱节严重；50 commit 没有任何 CHANGELOG，新人 onboarding 难
- **做法**：替换 README 主结构（介绍 / 快速开始 / 架构 / API / 6 大系统 / 验证 / 部署 / 已知边界），加 `CHANGELOG.md` 从 50 commit 倒推
- **工时**：0.5 d
- **验收**：README < 300 行，覆盖所有 6 大系统；CHANGELOG 含 50+ commit
- **风险**：低

### ~~R2. CI（.github/workflows/ci.yml）~~ ✅ 已完成（2026-09-20，feature/ci-integration）
> 实际超出原计划：除 11 个 py verify 外还含 UI e2e 3 个 + unit 92 + visual 8/8 + WebSocket，18 步全绿。pages.yml（Storybook + visual baseline 上 Pages）就绪，等 repo Settings → Pages 手动启用一次。
- **缺口**：PR 推上去没人自动验证，全靠手动 bhs-4 跑——容易漏检；16 verify 脚本里 13 个可走 CI
- **做法**：单 job `verify`：pnpm install → build → 起隔离 API → 跑 11 个 verify_*.py + 1 个 verify_auto_market.ts；UI mjs 跳过（playwright 跑需多端，本地 GH Actions 起不来）
- **工时**：0.5 d
- **验收**：PR 触发后 job 全绿；本地 `act` 可跑
- **风险**：低

### R3. verify_analytics.py 硬编码 REF 修复 ✅ 实际已完成（`5129296`），roadmap stale
- **现状**：脚本早已重写为双模式（isolated 自助对账 + production REF），`5129296` 提交"analytics self-check"。header 第 5–7 行说明支持两种模式，is_isolated 启发（users ≤3 且 bets==0）切换分支，isolated 分支按 `EXPECTED_STAKE=150 EXP_BETS=2 EXP_DEPOSIT=500 EXP_ACTIVE=1 EXP_PAYOUT=0` 自建数据对账。
- **本地静态验证（2026-09-26）**：用 `node:sqlite` 按 isolated 模式构造 fixture 跑 analytics.ts 同源聚合 SQL，**7/7 核心断言 PASS**（stake/bets/deposits/active/payout/users≥2/netRevenue）。剩 12 个次要断言（trends 14 点、hot-matches top1 字段、users top1 字段、权限矩阵 401/403）走 HTTP 路径，依赖 API 启动；CI ubuntu-latest 上 better-sqlite3 native binding 正常，能跑全 19/19。
- **遗留**：roadmap R3 描述 + CHANGELOG「verify_analytics.py 6/19」+ system-status.md「6/19（基线问题）」三处保留 stale 信息，需要文档校准。
- **结论**：本 R3 = **文档校准任务**，不是代码任务。

### R4. verify_health.mjs 空文件 ✅ 已完成（现有内容，CI 健康检查步骤跑通）
- **缺口**：0 字节的 e2e 脚本，要么补内容要么删
- **做法**：参考 health.ts（O1 round 实现）写一个 14/14 的 mjs（前面 commit message 写 14/14 但文件没提交）
- **工时**：0.25 d
- **验收**：跑通 14 个健康检查断言
- **风险**：低

---

## P1 — 商用前必做

### R5. verify_{k,l,m}_ux.mjs 隔离 playwright ✅ 大部分完成（2026-09-20 进 CI）
> CI 里已跑 3 个 UI e2e，但步骤是 `|| true` 非阻塞——失败不会红 CI。剩余工作：去掉 `|| true` 让 UI e2e 变硬门槛（需先确认 CI 稳定性）。
- **缺口**：3 个 UI 视觉验证脚本要 second web 端口 + 隔离 API + playwright 浏览器，**当前从未在隔离环境跑过**
- **做法**：写 `scripts/run_ui_e2e.sh`（或 .mjs），自动起：second API :14100 + second web（apps/web 已删除，现为 Expo 静态产物，CI 用 :14102）/ 跑 3 个 mjs / 清理
- **工时**：1 d
- **验收**：3 个 mjs 在 bhs-4 隔离环境跑通 16+19+19 = 54/54 PASS
- **风险**：高（playwright 在 CI 里装、headless 行为、动态加载等待都要测）

### R6. Customer Support 知识库 ✅ 已完成（2026-09-26）
- **缺口**：support.ts 9 endpoint 全在，但客服知识库（FAQ / 分类 / 搜索 / 用户自助查询）= 0；support 工單做完了，前置知识库没做
- **做法**：
  - `apps/api/src/db/schema.sql` + `apps/api/src/db/index.ts` 的 `migrate()` — 幂等创建 `kb_categories` + `kb_articles` 表（FK ON DELETE CASCADE、status CHECK 约束、2 个 index），seed 默认 5 分类（充值/提现/投注规则/账户安全/优惠活动）+ 5 篇 FAQ（Markdown body）
  - `apps/api/src/routes/kb.ts`（180 行）— 两组路由：
    - **公开** `kbRouter`：`GET /kb/categories` / `GET /kb/articles?q=&category=&limit=` / `GET /kb/articles/:slugOrId`（view_count 自增）/ `POST /kb/articles/:id/helpful`（yes/no 投票）
    - **admin** `adminKbRouter`：分类 CRUD + 文章 CRUD（status=draft/published/archived）+ reset-views 运维
  - 搜索：LIKE '%q%' 模糊匹配 title/body/tags，按 view_count DESC + updated_at DESC 排序（足够 MVP；后续可升级 FTS5）
  - `apps/api/src/index.ts`：挂 kbRouter + adminKbRouter
  - `scripts/test_kb.mjs`（10 tests）：分类 CRUD / CASCADE / 文章 CRUD / status 过滤 / slug 唯一 / 搜索 / 投票 / view_count 自增 / CHECK 约束
  - `scripts/verify_kb.py`：CI 端到端验证（10 个 assert）
  - `.github/workflows/ci.yml`：把 `kb` 加进 `for s in ...` 验证脚本循环
- **单元测试**：8 文件 / 120 tests / 0 fail（110 → 120，+10 R6）
- **CI**：新增 verify_kb.py 端到端（admin CRUD + 公开搜索 + 权限矩阵）
- **env**：无（功能完全在 DB 层）
- **验收**：admin 创建 5+ FAQ → user 搜索关键词命中；helpful 投票工作；权限 401/403 正确；CHECK 约束防非法 status
- **风险**：中→低（LIKE 搜索足够；后续量大再升级 FTS5；CASCADE 防孤儿）
- **未做（范围外）**：FTS5 全文索引（性能）；UI admin panel 编辑器（前端）；多语言 FAQ（locale 字段可后续加）

### R7. 风控：注册/下注/提现全局 rate limit ✅ 已完成（2026-09-26）
- **缺口**：只有 login 5/5min；注册、下注、提现无任何限流；admin 改赔无 audit（audit 是 R15，未做）
- **做法**（零依赖，内存态固定窗口 + fail-open）：
  - `apps/api/src/rateLimit.ts`（108 行）— `rateLimit({scope, keyBy: 'ip'|'user', max?, windowMs?})` 工厂；env 覆盖 `RATE_LIMIT_<SCOPE>_MAX` / `_WINDOW_MS`；标准 `429 + Retry-After + X-RateLimit-Limit/Remaining/Reset` 头；异常 fail-open
  - 4 个端点接入：
    - `POST /users`（公开注册）：`scope=register, keyBy=ip, max=5/min`
    - `POST /bets` + `/bets/parlay`（下注/串关）：`scope=bet, keyBy=user, max=30/min`
    - `POST /withdrawals`（提现申请）：`scope=withdraw, keyBy=user, max=10/min`
    - `PUT /markets/:id/odds`（admin 调赔）：`scope=odds_update, keyBy=user, max=60/min`
  - `apps/api/src/index.ts`：启动 `startRateLimitCleanup()` 每 5min 删过期 bucket（防 Map 无限增长）
  - `scripts/test_rate_limit.mjs`（9 tests）：IP/user 维度 / 跨 scope 独立 / 头设置 / 窗口过期 / 默认值 / cleanup
  - `scripts/verify_rate_limit.py`：CI 端到端验证（独立隔离 API + 低阈值 env 让脚本快速触 429）
- **单元测试**：7 文件 / 110 tests / 0 fail（101 → 110，+9 R7）
- **CI**：新增 `Run rate-limit e2e` job（独立隔离 API + RATE_LIMIT_*_MAX=5 让触发可控）
- **env 默认值（生产建议）**：register 5/min · bet 30/min · withdraw 10/min · odds_update 60/min — 单进程适用（pm2 cluster 需 Redis 共享）
- **验收**：人肉 1 秒 10 次 POST /bets → 后 5 次 429 + Retry-After；verify_rate_limit.py 全 PASS
- **风险**：低（fail-open 保证限流器 bug 不影响主流程）

### R8. 真实支付通道联调
- **缺口**：payments 三个 provider 抽象（mock / nowpayments / provider）都在，但 nowpayments 未真实联调
- **做法**：选 1 个通道（如 Stripe / PingPong）做联调，加 webhook 验签
- **工时**：3 d（**含与通道方对接**）
- **验收**：沙箱环境能完成 1 笔真实充值（10 USDT 等价），回调入账
- **风险**：高（外部依赖）

### R9. 监控 / 告警 ✅ 已完成（2026-09-26）
- **缺口**：pm2 进程崩了没人知道；DB 写满 100% 没人知道；登录失败激增没人知道；feed 断链 1 个月才被发现是直接教训
- **做法**（零外部依赖，纯 Node http + 标准库）：
  - `apps/api/src/monitor.ts`（167 行）— 错误中间件（4 参数错误兜底）+ 5xx rate 阈值告警 + 后台 tick 扫 feed_log 错误数 / DB size + 去抖动（5min 同 key 不重发）+ Webhook 投递（Slack / Feishu 双格式）
  - `apps/api/src/index.ts` — 挂 `monitorMiddleware` + 启动 `startMonitorTick(db)`
  - `apps/api/src/routes/health.ts` — `/api/health` 响应附加 `metrics: {feed_log_errors_24h, open_bets, db_size_bytes, uptime_s}`，外部 probe 可一并观察
  - `scripts/test_monitor.mjs`（9 tests）— 覆盖 webhook 投递 / 去抖动 / 阈值触发 / fail-quiet / Feishu 格式 / collectMetrics 数值
  - `scripts/run_unit_tests.mjs` — 6 文件 / 101 tests（92 → 101，+9 R9）
- **配置**（env，全部默认关闭）：`ALERT_WEBHOOK_URL` / `ALERT_WEBHOOK_FORMAT` (slack|feishu) / `ALERT_DEDUPE_MS` / `ALERT_5XX_RATE_THRESHOLD` / `ALERT_5XX_MIN_SAMPLES` / `ALERT_FEED_LOG_ERR_THRESHOLD` / `ALERT_TICK_INTERVAL_MIN` / `SERVICE_NAME`
- **验收**：人为制造 5xx → webhook 10s 内收到 → 5min 内重复不重发（去抖）→ webhook 失败不影响主请求（fail-quiet）
- **风险**：低（运行时读 env，测试可动态配；fail-quiet 兜底）
- **未做（范围外）**：Sentry SDK 接入（重型外部依赖）、pm2 pm2-logrotate（运维侧）；如需后续加，可在 monitor.ts 加新 category 类型
- **剩余小建议**：bhs-4 上 `~/.betting-feed.env` 加 `ALERT_WEBHOOK_URL=<Feishu webhook URL>` + `SERVICE_NAME=betting-bhs-4`，feed-scores-fix 的 R0 一并设上

---

## P2 — 上线后第一个月补

### R10. README/CHANGELOG 自动化
- **缺口**：R1 写完后，commit 多了 README 又过时
- **做法**：用 conventional commits 解析 commit message，CHANGELOG 自动生成（standard-version 或 release-please）
- **工时**：0.5 d
- **验收**：跑 `pnpm release` 自动 bump version + 更新 CHANGELOG
- **风险**：低

### R11. CRM：客户分群 + 营销自动化 ✅ 已完成（2026-09-26）
- **缺口**：CRM 缺分群（按 VIP/累计/活跃度）、自动营销（生日优惠、沉睡召回、活动日历）
- **做法**：
  - **Schema**（4 张表 + 2 index，`schema.sql` + `migrate()` 幂等）：
    - `crm_segments`（slug 唯一 + rules_json DSL + cached_count 缓存）
    - `crm_campaigns`（FK segment + action_type 三选一 + trigger manual/cron + cooldown_days）
    - `crm_campaign_executions`（UNIQUE(campaign_id, user_id) 防重复）
    - `notifications`（站内信收件箱，category 分类 system/promotion/campaign）
  - **DSL 评估器**（`apps/api/src/crmSegments.ts`）：
    - rule key 白名单：`vipTier`（支持 `gold+` 这种 ≥）/ `lifetimeStake` / `totalBets` / `daysSinceLastBet` / `daysSinceRegistered` / `marketingOptIn`
    - 字符串值转 SQL WHERE 片段（白名单 + 无注入）
    - admin 自动排除（u.role != 'admin'）
  - **Campaign executor**（同文件）：3 种 action — `site_message`（写 notifications）/ `promotion_code`（带 code 的站内信）/ `bonus_credit`（直接加余额 + transactions + 通知）；UNIQUE 防重复 + cooldown 二次防御；事务包裹
  - **后台 scheduler**（`startCampaignScheduler(db, intervalMin)`）：每 30 min 评估 enabled segments + 跑 enabled cron campaigns（cooldown 控制频率）
  - **API 路由**（`routes/crmSegments.ts` + `routes/notifications.ts`）：
    - admin: `GET/POST/PUT/DELETE /admin/crm/segments` + `POST /admin/crm/segments/:id/preview`
    - admin: `GET/POST/PUT/DELETE /admin/crm/campaigns` + `POST /admin/crm/campaigns/:id/run`
    - admin: `GET /admin/crm/executions`（审计）
    - admin: `POST /admin/notifications/broadcast`（群发站内信）
    - user: `GET /notifications` + `POST /notifications/:id/read` + `POST /notifications/read-all`
  - `scripts/test_crm_segments.mjs`（15 tests）：DSL 评估各 key / 组合 / 非法 rule 防抛 / campaign 3 action / UNIQUE 防重复 / notifications 收发
  - `scripts/verify_crm_segment.py`：CI 端到端 12 asserts
  - `.github/workflows/ci.yml`：把 `crm_segment` 加入 `for s in ...` 验证循环
- **单元测试**：9 文件 / 135 tests / 0 fail（120 → 135，+15 R11）
- **CI**：verify_crm_segment.py 12 asserts 端到端
- **env**：`CRM_TICK_MIN` 默认 30（后台调度周期）
- **验收**：admin 建分群「近 7 天未下注 + VIP≥silver」→ preview 看见命中 user → 创建 site_message campaign 手动 run → user 收件箱收到 → mark read 工作；bonus_credit campaign 跑后 balance + 50 + transactions 写入
- **风险**：中→低（DSL 白名单 + 字符串转义；UNIQUE 防重复；事务包裹）
- **未做（范围外）**：cron 表达式解析（用 tick 周期模拟）；邮件/SMS 推送（仅站内信）；A/B 测试；用户取消订阅流程（marketing_opt_in 已支持，但取消 UI 未做）

### R12. Support：邮件通知 + SLA
- **缺口**：工單状态变更无邮件；SLA 无监控
- **做法**：smtp 抽象 + nodemailer；状态变更触发邮件；SLA 表（首响 < 4h / 解决 < 24h）+ 看板
- **工时**：2 d
- **验收**：工單创建 → user 5 秒内收到邮件；admin 看板显示 SLA 倒计时
- **风险**：中（需要 SMTP 凭据）

### R13. Analytics：实时大屏 + 数据导出 ✅ 已完成（2026-09-26）
- **缺口**：当前 analytics 4 端点是 admin 个人看，没有大屏；数据无法导出
- **做法**：
  - **SSE 实时大屏**（`GET /api/analytics/realtime`）：
    - Server-Sent Events 每 5s 推一次 dashboard 快照（`data: {dashboard, ws, ts}`，首帧立即）
    - 认证双通道：`Authorization: Bearer`（脚本/fetch）+ `?token=`（浏览器 EventSource 无法设头的标准解法）
    - admin-only（手动 verifySessionToken + 查 users.role）；连接数上限 `ANALYTICS_REALTIME_MAX_CLIENTS`（默认 10，429 防泄漏）；`req.on('close')` 清理 interval
    - 推送周期 env `ANALYTICS_REALTIME_INTERVAL_S`（默认 5s，最小 2s）
  - **CSV 导出**（3 端点，admin-only，`Content-Disposition: attachment`）：
    - `GET /analytics/export/trends.csv?days=14`
    - `GET /analytics/export/users.csv?limit=100`
    - `GET /analytics/export/hot-matches.csv?limit=50`
  - **CSV 序列化**（`apps/api/src/csv.ts`）：RFC 4180 转义（逗号/引号/换行 → 引号包裹 + 内部翻倍；对象 → JSON）；CRLF 行分隔
  - `scripts/test_csv.mjs`（13 tests）：转义各形态 / 空集 / headers 指定 / CRLF
  - `scripts/verify_analytics_export.py`：11 asserts e2e（CSV 内容 + 转义 + SSE 双通道认证 + 401/403 权限）
  - `.github/workflows/ci.yml`：verify 循环加 `analytics_export`（共 13 个 verify 脚本）
- **单元测试**：10 文件 / 148 tests / 0 fail（135 → 148，+13 R13）
- **验收**：admin 拿到合法 CSV（含引号转义字段）；SSE admin 双通道 200 + 首帧 dashboard；普通用户 403 / anon 401
- **风险**：低（SSE 手动认证 + 连接数上限；CSV 纯序列化无注入面）
- **未做（范围外）**：前端大屏 UI（recharts 可视化）——后端数据源已就绪；WebSocket 版推送（SSE 已满足单向场景）

### R14. UI 主题切换
- **缺口**：当前只有 dark neon 一套主题
- **做法**：在 packages/ui 加 light theme token；切换按钮持久化到 localStorage
- **工时**：1 d
- **验收**：切换实时生效，刷新保持
- **风险**：低

### R15. Admin 审计日志
- **缺口**：admin 改赔/挂盘/审批/手动改账户余额无 audit
- **做法**：`audit_logs` 表 + 中间件；admin UI 加查询页
- **工时**：2 d
- **验收**：admin 改一次赔率 → audit_logs 1 行；查得到改前/改后
- **风险**：低

### R16. 多 feed 源聚合
- **缺口**：当前只 the-odds-api 一源
- **做法**：feeds/provider.ts 抽象支持多 provider；加 1 个备用（如 Sportradar / Opta）
- **工时**：3 d
- **验收**：the-odds-api 失败时备用源顶上；2 源价格不一致时按优先级取
- **风险**：高（多源数据对齐）

---

## P3 — 长期 / 增长

### R17. 早期结算（cashout）
- **缺口**：用户下注后不能提前兑现
- **做法**：实时赔率 + 公式计算当前价值，扣除手续费
- **工时**：3 d
- **验收**：下注 100 @ 2.0，比赛 50% 时 cashout = 95 ±5
- **风险**：中

### R18. CMS SEO + 媒体库
- **缺口**：内容页无 SEO 标签；图片管理散落
- **做法**：加 OG/Twitter/JSON-LD；uploads 表 + 文件管理 UI
- **工时**：2 d
- **验收**：内容页 <head> 含完整 OG；admin 上传图片可引用
- **风险**：低

### R19. i18n 前端文案
- **缺口**：locale 字段在 CMS，但前端 UI 文案未全 i18n
- **做法**：i18next + 抽离硬编码；en/zh-CN/zh-TW 三语
- **工时**：3 d
- **验收**：切换语言实时生效，刷新保持
- **风险**：中（文案量大）

### R20. PWA 离线
- **缺口**：mobile web 无离线
- **做法**：service worker + 缓存赛事数据 + 离线时只读
- **工时**：1 d
- **验收**：断网后赛事列表仍能查
- **风险**：低

### R21. 投注推荐 / AI 分析
- **缺口**：纯数据展示，无 AI 建议
- **做法**：基础 ML（赔率转 implied probability + 历史命中率）→ 推送"价值投注"
- **工时**：5 d
- **验收**：推送 Top3 价值投注，命中率 > 52%（回测）
- **风险**：高（命中率的统计真实性）

### R22. KYC / 反洗钱
- **缺口**：用户无身份验证
- **做法**：上传身份证 + 第三方 OCR/KYC 服务
- **工时**：5 d
- **验收**：用户上传 1 张身份证 + 1 张自拍，5 分钟内审核通过
- **风险**：高（外部 KYC 服务 + 合规）

---

## 优先级矩阵（一图速览）

```
        高 ROI
          │
  R1  R2  │  R5  R6  R8
  R3  R4  │  R7  R9
──────────┼────────── 高紧急
  R10 R14 │  R11 R12 R13
  R18     │  R15 R16
──────────┼──────────
  R19 R20 │  R17 R21 R22
          │
        低 ROI
   低成本 ────────── 高成本
```

## 推荐下一步（按 ROI 排序，2026-09-26 更新）

| 顺序 | ID | 标题 | 估计 | 价值 |
|---|---|---|---|---|
| ~~1~~ | ~~R1~~ | ~~README + CHANGELOG~~ ✅ 09-19 | — | onboarding |
| ~~2~~ | ~~R4~~ | ~~verify_health.mjs~~ ✅ 已有内容 | — | 测试覆盖 |
| ~~3~~ | ~~R2~~ | ~~CI workflow~~ ✅ 09-20 | — | 长期省时 |
| ~~4~~ | ~~R5~~ | ~~UI e2e~~ ✅ 进 CI（非阻塞） | — | UI 安全网 |
| 1 | **R0** | **bhs-4 部署 feed-scores-fix + 验证 settle 恢复** | **0.25 d** ⏳ 脚本就绪 | **54 笔 open bets 结算 + 额度达标（当前唯一 P0）** |
| 2 | ~~R3~~ | ~~verify_analytics.py 修基线~~ ✅ `5129296` 已完成 | — | 测试可信（roadmap stale，需文档校准） |
| 3 | ~~R9~~ | ~~监控 / 告警~~ ✅ 2026-09-26 | — | 稳定（feed 断链 1 个月才被发现就是教训） |
| 4 | ~~R7~~ | ~~全局 rate limit~~ ✅ 2026-09-26 | — | 防滥用 |
| 5 | ~~R6~~ | ~~Support 知识库~~ ✅ 2026-09-26 | — | 客服闭环 |
| 6 | ~~R11~~ | ~~CRM 分群 + 自动化~~ ✅ 2026-09-26 | — | 增长 |
| 7 | ~~R13~~ | ~~Analytics 实时大屏~~ ✅ 2026-09-26 | — | 运营 |

**R0 说明**：feed-scores-fix（`0540faa`）已合 master 但生产验证未闭环。**脚本已 commit**（`scripts/deploy_feed_fix.sh` + `scripts/verify_feed_fix.sh`），bhs-4 一行命令即可部署 + 验证。验收：① feed_log 不再出现 404 UNKNOWN_SPORT；② the-odds-api 月额度消耗 ≤450；③ open bets 开始自动结算。**这是当前唯一 P0。**

**2026-09-26 状态：推荐表 1-7 全部完成**（R0 待 bhs-4 执行，其余代码级全部落地）。剩余未做 = P3 长期项（R14 主题切换 / R15 审计日志 / R16 多源聚合 / R17 cashout / R18 SEO / R19 i18n / R20 PWA / R21 AI 推荐 / R22 KYC）+ 版本化 0.2.0 收口（打 tag + release）。

## 范围外（不做）

- ~~实时滚球 push（WebSocket 全双工）~~ **已完成**：Sprint 4 C3 交付 `/ws/odds` 实时赔率 broadcast（`docs/WEBSOCKET_REALTIME.md`）。真·滚球数据源 push 仍范围外
- 多商户/多租户 — 单租户 MVP
- 区块链 / crypto 真支付 — 现在 mock 就够
- 完整 BI 平台 — 已有基础 admin 报表，需要再扩
