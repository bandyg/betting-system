# Roadmap — betting-system MVP 缺口与下一步

> 与 `system-status.md` 配套。本文件只列**当前还差什么、优先级、估计工时**，不写实现。
> 基准 commit：`beb39c6`
> 用途：决定下几个 feature。

## 评分维度

- **P0**：阻塞 / 隐患 / 一次失误就出大事
- **P1**：核心体验 / 商用前必做
- **P2**：上线后第一个月补
- **P3**：增长 / 长期能力

每条含：**工时估计**（单人日）、**验收标准**、**风险/前置**。

---

## P0 — 立即

### R1. README 重写 + CHANGELOG
- **缺口**：README 仍是 5-route MVP 描述，跟现实 16 route / 72 endpoint / 6 系统脱节严重；50 commit 没有任何 CHANGELOG，新人 onboarding 难
- **做法**：替换 README 主结构（介绍 / 快速开始 / 架构 / API / 6 大系统 / 验证 / 部署 / 已知边界），加 `CHANGELOG.md` 从 50 commit 倒推
- **工时**：0.5 d
- **验收**：README < 300 行，覆盖所有 6 大系统；CHANGELOG 含 50+ commit
- **风险**：低

### R2. CI（.github/workflows/ci.yml）
- **缺口**：PR 推上去没人自动验证，全靠手动 bhs-4 跑——容易漏检；16 verify 脚本里 13 个可走 CI
- **做法**：单 job `verify`：pnpm install → build → 起隔离 API → 跑 11 个 verify_*.py + 1 个 verify_auto_market.ts；UI mjs 跳过（playwright 跑需多端，本地 GH Actions 起不来）
- **工时**：0.5 d
- **验收**：PR 触发后 job 全绿；本地 `act` 可跑
- **风险**：低

### R3. verify_analytics.py 硬编码 REF 修复
- **缺口**：脚本顶部 `REF: stake=5681.0 bets=80...` 是 1865e17 当时生产 DB 的快照，隔离 DB 跑会 13/19 FAIL，**当前实际是测试 bug，不是代码 bug**（前面已确认）
- **做法**：改成"自助对账"——脚本自己往隔离 DB 写一批已知交易，然后断言聚合值；或者用 `BETTING_DB_PATH` 跳过 REF 校验
- **工时**：0.5 d
- **验收**：隔离 DB 跑 19/19 PASS；生产 DB 跑（admin token + 真数据）也 19/19
- **风险**：中（要理解 analytics 聚合的预期公式）

### R4. verify_health.mjs 空文件
- **缺口**：0 字节的 e2e 脚本，要么补内容要么删
- **做法**：参考 health.ts（O1 round 实现）写一个 14/14 的 mjs（前面 commit message 写 14/14 但文件没提交）
- **工时**：0.25 d
- **验收**：跑通 14 个健康检查断言
- **风险**：低

---

## P1 — 商用前必做

### R5. verify_{k,l,m}_ux.mjs 隔离 playwright
- **缺口**：3 个 UI 视觉验证脚本要 second web 端口 + 隔离 API + playwright 浏览器，**当前从未在隔离环境跑过**
- **做法**：写 `scripts/run_ui_e2e.sh`（或 .mjs），自动起：second API :14100 / second vite preview :14200 / 跑 3 个 mjs / 清理
- **工时**：1 d
- **验收**：3 个 mjs 在 bhs-4 隔离环境跑通 16+19+19 = 54/54 PASS
- **风险**：高（playwright 在 CI 里装、headless 行为、动态加载等待都要测）

### R6. Customer Support 知识库
- **缺口**：support.ts 9 endpoint 全在，但客服知识库（FAQ / 分类 / 搜索 / 用户自助查询）= 0；support 工單做完了，前置知识库没做
- **做法**：建 `kb_categories` + `kb_articles` 表；admin CRUD；user GET 公开接口；UI 在 mobile support 页加搜索
- **工时**：2 d
- **验收**：admin 建 5 篇 FAQ，user 搜索关键词命中 3 篇；verify_kb.py 全 PASS
- **风险**：中（搜索实现：LIKE %?% vs FTS5）

### R7. 风控：注册/下注/提现全局 rate limit
- **缺口**：只有 login 5/5min；注册、下注、提现无任何限流；admin 改赔无 audit
- **做法**：写中间件 `rateLimit({windowMs, max, byIp|byUser})`，挂到 POST /users、POST /bets、POST /withdrawals、PUT /markets/:id/odds
- **工时**：1 d
- **验收**：同一 IP 1 秒内 10 次 POST /bets → 后 5 次 429；verify_rate_limit.py 10/10 PASS
- **风险**：低

### R8. 真实支付通道联调
- **缺口**：payments 三个 provider 抽象（mock / nowpayments / provider）都在，但 nowpayments 未真实联调
- **做法**：选 1 个通道（如 Stripe / PingPong）做联调，加 webhook 验签
- **工时**：3 d（**含与通道方对接**）
- **验收**：沙箱环境能完成 1 笔真实充值（10 USDT 等价），回调入账
- **风险**：高（外部依赖）

### R9. 监控 / 告警
- **缺口**：pm2 进程崩了没人知道；DB 写满 100% 没人知道；登录失败激增没人知道
- **做法**：sentry.io 接入（前端+后端）+ pm2 pm2-logrotate + 简单告警（关键 metric 5xx > 1% 触发 Feishu webhook）
- **工时**：1 d
- **验收**：人为制造 5xx，10s 内收到 Feishu 通知
- **风险**：低

---

## P2 — 上线后第一个月补

### R10. README/CHANGELOG 自动化
- **缺口**：R1 写完后，commit 多了 README 又过时
- **做法**：用 conventional commits 解析 commit message，CHANGELOG 自动生成（standard-version 或 release-please）
- **工时**：0.5 d
- **验收**：跑 `pnpm release` 自动 bump version + 更新 CHANGELOG
- **风险**：低

### R11. CRM：客户分群 + 营销自动化
- **缺口**：CRM 缺分群（按 VIP/累计/活跃度）、自动营销（生日优惠、沉睡召回、活动日历）
- **做法**：建 `segments` + `campaigns` + `campaign_executions` 表；admin UI 建分群 + 触发条件；user 收到站内/邮件
- **工时**：3 d
- **验收**：admin 建"近 7 天未下注且 VIP≥silver"分群 → 自动发"5% 返水"促销 → 60 秒内 5 个 user 收到
- **风险**：中

### R12. Support：邮件通知 + SLA
- **缺口**：工單状态变更无邮件；SLA 无监控
- **做法**：smtp 抽象 + nodemailer；状态变更触发邮件；SLA 表（首响 < 4h / 解决 < 24h）+ 看板
- **工时**：2 d
- **验收**：工單创建 → user 5 秒内收到邮件；admin 看板显示 SLA 倒计时
- **风险**：中（需要 SMTP 凭据）

### R13. Analytics：实时大屏 + 数据导出
- **缺口**：当前 analytics 4 端点是 admin 个人看，没有大屏；数据无法导出
- **做法**：加 `/api/analytics/realtime` (WebSocket 或 SSE) + CSV 导出端点
- **工时**：2 d
- **验收**：admin 实时看 30s 滚动的下注/充值/在线人数；导出 14 天趋势为 CSV
- **风险**：低

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

## 推荐下一步（按 ROI 排序）

| 顺序 | ID | 标题 | 估计 | 价值 |
|---|---|---|---|---|
| 1 | R1 | README + CHANGELOG | 0.5 d | onboarding |
| 2 | R4 | verify_health.mjs 补内容 | 0.25 d | 测试覆盖 |
| 3 | R2 | CI workflow | 0.5 d | 长期省时 |
| 4 | R3 | verify_analytics.py 修基线 | 0.5 d | 测试可信 |
| 5 | R5 | UI e2e 隔离 playwright | 1 d | UI 安全网 |
| 6 | R9 | 监控 / 告警 | 1 d | 稳定 |
| 7 | R7 | 全局 rate limit | 1 d | 防滥用 |
| 8 | R6 | Support 知识库 | 2 d | 客服闭环 |
| 9 | R11 | CRM 分群 + 自动化 | 3 d | 增长 |
| 10 | R13 | Analytics 实时大屏 | 2 d | 运营 |

**前 4 项（1.75 d）可在一个 sprint 完成**——本质都是文档/CI/测试基线，零业务风险。
**5-7（3 d）是上线前必做**，构成"生产就绪"门槛。
**8-10（7 d）属于"上线后第一个月"**，要看业务压力再排。

## 范围外（不做）

- 实时滚球 push（WebSocket 全双工）— 当前 autoMarket 是定时轮询，已满足 90% 场景
- 多商户/多租户 — 单租户 MVP
- 区块链 / crypto 真支付 — 现在 mock 就够
- 完整 BI 平台 — 已有基础 admin 报表，需要再扩
