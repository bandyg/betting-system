# System Status — betting-system MVP

> 记录时间：2026-09-17（初版）/ 2026-09-26 刷新
> 基准 commit：初版 `beb39c6` → 刷新 `6d13584`（master，含 feed-scores-fix）
> 用途：新人 onboarding / 季度回顾 / 决定下一步开发优先级

## 1. 仓库总览

- **路径**：`D:\projects\betting-system`（本机） / `~/services/betting-system`（bhs-4）
- **远端**：`git@github.com:bandyg/betting-system.git`（public）
- **license**：未指定（README 无 license 段）
- **技术栈**：Node 24 + TypeScript 5.7 + Express 4 + better-sqlite3 11 + pnpm 11 monorepo
- **部署**：pm2 4 个 betting-* 进程（api :4100 / web :4200 / mobile-web :4300 / feed-worker）

## 2. 仓库结构

```
betting-system/
├── apps/
│   ├── api/        # Express REST API（:4100）— 16 route 文件 / 72 endpoint
│   ├── web/        # admin 后台（React 18 + Vite 6，:4200）
│   └── mobile/     # Expo / RN-Web 三端共享（:4300）
├── packages/
│   ├── core/       # 共享 types + api client + hooks
│   └── ui/         # 设计系统（dark neon theme + Card/Button/OddsButton 等）
├── scripts/        # 25 个验证/测试脚本（17 verify + 5 unit test + visual/基线工具）
├── docs/           # 设计/现状文档（本文件 + Storybook + visual-baseline）
├── data/           # SQLite 数据（git 忽略）
├── ecosystem.config.js   # pm2 4 进程配置
├── pnpm-workspace.yaml   # apps/* + packages/* + allowBuilds
└── README.md
```

## 3. 数字指标

| 维度 | 数字 |
|---|---|
| API route 文件 | 16（另 `src/wsHub.ts` WebSocket hub，非 REST） |
| API endpoint | 72（REST）+ `/ws/odds` 实时赔率 |
| 前端 app | 3（web / mobile / api 内嵌） |
| 共享 package | 2（core / ui） |
| 验证脚本 | 25 = 17 verify + 5 unit test + 3 工具（capture_baseline / visual_regression / run_unit_tests） |
| 业务模块（apps/api/src） | analytics / risk / jwt / payments / feeds / wsHub |
| feeds 子模块 | 12 个（autoMarket / demo_seed / ingest / mapper / mock / mock_scores / provider / scheduler / settle / types / wagering / worker）+ 3 个 `__verify__*.ts` 内联测试 |
| 单元测试 | 92/92 PASS（Node --test，5 文件，< 2s） |
| 视觉回归 | 8/8 PASS（Playwright + pixelmatch） |
| 数据库 | SQLite 3.3MB（生产） / 81 種 sport×league / 3340 场赛事 |
| 远端 push 状态 | 全部在 origin/master（无 force-push 历史） |
| 本地 backup tag | `backup-local-pre-reset-2026-09-17`（无害历史） |
| bhs-4 backup tag | `backup-pre-push-2026-09-17`（无害历史） |

## 4. 六大系统完成度（对照 Amelco）

### 4.1 PAM（Player Account Management）— **80%**
| 子系统 | route | 验证 | 完成度 |
|---|---|---|---|
| 注册/登录/会话/JWT | `auth.ts`（2）| inline | ✅ 100% |
| 用户/账户 | `accounts.ts`（4）| verify_accounts.py 19/19 | ✅ 100% |
| 支付通道（mock+nowpayments）| `payments.ts`（6）+ 3 模块 | 无独立 verify | 🟡 70% |
| 提现闭环 | `withdrawals.ts`（5）| verify_withdrawals.py 29/29 | ✅ 90% |
| 风控限额 | `risk.ts`（2）| verify_crm_risk.py 部分 | ✅ 90% |
| 流水/wagering | feeds/wagering.ts | inline | ✅ 80% |

**缺口**：真实支付通道（nowpayments 接入）、反洗钱规则、KYC

### 4.2 SPORTBOOK（核心投注）— **85%**
| 子系统 | 入口 | 验证 | 完成度 |
|---|---|---|---|
| 赛事 CRUD | matches.ts（3）| verify_matches.py 15/15 | ✅ 100% |
| 市场 CRUD + 交易工具 | markets.ts（5）| verify_markets.py 26/26 | ✅ 100% |
| 下注 | bets.ts（4）| inline | ✅ 95% |
| 结算（1x2/ah/ou + parlay 腿级）| settle.ts + feeds/settle.ts | inline | ✅ 95% |
| 滚球 autoMarket | feeds/autoMarket.ts | verify_auto_market.ts 13/13 | ✅ 90% |
| Parlay 串关 | crm.ts + settle | verify_parlay.py 39/39 | ✅ 100% |
| 多运动支持（18 运动）| sports.ts（2）+ feeds/mapper | verify_feeds_multisport.py 6/7 | ✅ 95% |
| 数据源接入（the-odds-api）| feeds/{provider,scheduler,worker,ingest} | live | ✅ 100% |
| 比分刷新+自動派彩 | feeds/ingest + settings.feed_auto_settle | live | ✅ 100% |

**缺口**：早期结算（cashout）、亚洲盘全半场混合、组合系统投注

### 4.3 CMS（内容管理）— **75%**
| 子系统 | 入口 | 验证 | 完成度 |
|---|---|---|---|
| 内容 CRUD | cms.ts（8）| verify_cms.py 39/39 | ✅ 100% |
| 多语言（locale 字段+过滤）| cms.ts | verify_cms.py | ✅ 100% |
| 生命周期（draft/publish/定时/归档/恢复）| cms.ts 状态机 | inline | ✅ 100% |
| 富文本渲染 | mobile/components/markdown + packages/ui/markdown | UI | ✅ 80% |
| 阅读量统计 | cms.ts | inline | ✅ 80% |
| 内容详情页 | mobile + web | UI | ✅ 80% |
| 站内 SEO/OG 标签 | — | — | ❌ 0% |

**缺口**：SEO、媒体库（图片管理）、版本/草稿对比

### 4.4 CRM（客户关系/营销）— **80%**
| 子系统 | 入口 | 验证 | 完成度 |
|---|---|---|---|
| 促销 promotions | crm.ts（10）| verify_crm_risk.py 部分 | ✅ 90% |
| 优惠领取 claims（含风控/限额/审批/流水）| crm.ts | verify_crm_risk.py 49/49 | ✅ 100% |
| VIP 5 级体系 | crm.ts loyalty | verify_vip.py 24/24 | ✅ 100% |
| 用户偏好 | crm.ts preferences | inline | ✅ 70% |
| 客户分群/标签 | — | — | ❌ 0% |
| 营销活动日历 | — | — | ❌ 0% |
| 个性化推送（站内/邮件/短信）| — | — | ❌ 0% |

**缺口**：客户分群、自动化营销、跨渠道通知

### 4.5 Data Analytics（数据分析）— **70%**
| 子系统 | 入口 | 验证 | 完成度 |
|---|---|---|---|
| 仪表盘聚合（stake/payout/deposit/active/users）| analytics.ts（4）| verify_analytics.py 6/19（基线问题）| ✅ 80% |
| 14 天趋势 | analytics.ts | 同上 | ✅ 80% |
| 热门赛事 Top5 | analytics.ts | 同上 | ✅ 80% |
| 用户画像 Top5 | analytics.ts | 同上 | 🟡 60% |
| Admin 报表 tab | mobile | UI | 🟡 70% |
| 实时大屏 / 漏斗 / 留存 / cohort | — | — | ❌ 0% |
| 数据导出（CSV/Excel）| — | — | ❌ 0% |
| BI 工具对接 | — | — | ❌ 0% |

**缺口**：实时分析、漏斗/留存分析、cohort、BI 接入、数据导出

### 4.6 Customer Support（客服工單）— **60%**
| 子系统 | 入口 | 验证 | 完成度 |
|---|---|---|---|
| 工單后端（user/admin/消息/状态）| support.ts（9）| verify_support.py 65/65 | ✅ 100% |
| 移动端联系客服入口 + support 页 | mobile | UI | ✅ 90% |
| 客服知识库（FAQ/分类/搜索）| — | — | ❌ 0% |
| 邮件通知（工單状态变更）| — | — | ❌ 0% |
| SLA 监控 / 升级规则 | — | — | ❌ 0% |
| 多客服协作 / 内部备注 | — | — | ❌ 0% |
| 客服绩效报表 | — | — | ❌ 0% |
| 设计文档 | docs/customer-support-plan.md | — | ✅ 已规划 |

**缺口**：知识库、邮件通知、SLA、多人协作、绩效

## 5. 基础设施

| 模块 | 状态 | 说明 |
|---|---|---|
| Health check /api/health | ✅ 100% | O1 round：web HTTP + db SELECT 1 + redis RESP + PG startup，3s 单飞缓存 |
| 认证 / 授权 | ✅ 100% | JWT 7d + bcrypt + lazy SHA-256 upgrade + rate limit 5/429 + security headers |
| 数据源 the-odds-api | ✅ 100% live | 18 运动 mapper + upcoming 端点 + env-gated scheduler + **额度治理 ≤450 req/月**（feed-scores-fix） |
| 自动派彩 | ✅ 100% | settings.feed_auto_settle 开关 + 幂等 settleMatch + **scores 断链已修**（match_feed_key + resolveScoreKeys） |
| WebSocket 实时赔率 | ✅ 100% | wsHub `/ws/odds` + 前端 useLiveOdds（自动重连 + 心跳 + flash 动画） |
| 共享 packages | ✅ 100% | core（types/api/hooks）+ ui（设计系统 + tokens 化） |
| **CI/CD** | ✅ 100% | GitHub Actions 18 步：API e2e 11 verify + health + UI e2e 3 + unit 92/92 + visual 8/8 + WebSocket |
| **GitHub Pages** | 🟡 90% | pages.yml 就绪（storybook + visual baseline gallery），需 repo Settings 手动 enable 一次 |
| **README** | ✅ 90% | 已重写（6 系统 / API / 测试 / 部署 / 边界） |
| **CHANGELOG** | ✅ 90% | Keep-a-Changelog 格式，0.1.0 全量回溯 |
| 监控/告警 | ❌ 0% | 无 Sentry/StatsD/Prometheus |
| 备份策略 | 🟡 30% | DB 单点；.bak 文件散落（已 gitignore 修复） |
| i18n（多语言文案）| 🟡 40% | locale 字段在 CMS，但前端 UI 文案未全 i18n |

## 6. 前端

| App | 端口 | 内容 | 完成度 |
|---|---|---|---|
| apps/web | 4200 | Admin 后台（K 轮 lobby / L 错误 UX / M 加载态已迭代）| 🟡 70% |
| apps/mobile | 4300 | Expo/RN-Web 三端共享（赛事/下注单/账户/CMS/CRM/报表/支持）| 🟡 75% |
| apps/api | 4100 | Express API | ✅ 100% |

**Sprint 4-5 已补**：WebSocket 实时赔率（flash 动画）、客服聊天增强（markdown/表情/附件/已读）、设计 tokens 化（`docs/DESIGN_TOKENS.md`）、Storybook（`docs/storybook/`，30 文件）、单元测试 92/92、视觉回归 8/8。

**未做**：暗色/亮色主题切换、PWA 离线

## 7. 验证脚本覆盖（16 个）

| 脚本 | 覆盖 route | 上次结果 |
|---|---|---|
| verify_accounts.py | accounts.ts | **19/19** ✅（feature/verify-core-routes 加） |
| verify_matches.py | matches.ts | **15/15** ✅（feature/verify-core-routes 加） |
| verify_markets.py | markets.ts | **26/26** ✅（feature/verify-core-routes 加） |
| verify_withdrawals.py | withdrawals.ts | 29/29 ✅ |
| verify_cms.py | cms.ts | 39/39 ✅ |
| verify_crm_risk.py | crm + risk | 49/49 ✅ |
| verify_analytics.py | analytics.ts | 6/19（**测试基线问题，非代码 bug**） |
| verify_feeds_multisport.py | feeds + sports | 6/7 |
| verify_parlay.py | parlay | 39/39 ✅ |
| verify_support.py | support.ts | 65/65 ✅ |
| verify_vip.py | crm VIP | 24/24 ✅ |
| verify_auto_market.ts | feeds/autoMarket | 13/13 ✅ |
| verify_websocket.mjs | wsHub /ws/odds | **PASS** ✅（CI WebSocket job） |
| verify_k_ux.mjs | web UI | CI 跑（`|| true` 非阻塞） |
| verify_l_ux.mjs | web UI | CI 跑（`|| true` 非阻塞） |
| verify_m_ux.mjs | web UI | CI 跑（`|| true` 非阻塞） |
| verify_health.mjs | health.ts | CI 跑 ✅（已补内容） |

**全跑可达 17 个 verify 脚本；CI（GitHub Actions 18 步）在 master HEAD `01e4400` 完整跑过全绿。** 另有 5 个单元测试文件（92 tests）+ 视觉回归 8 页面不在此表。

## 8. 生产稳定性

- pm2 4 个 betting-* 进程（api / web / mobile-web / feed-worker）持续 online
- 12 个其它业务进程同步跑（dify / market-data / search-agent / tradeview-analyze / sim-trade / llm-chat-agent 等）
- **2026-09-21 诊断 + 09-22 修复**：feed scores 断链（`upcoming` key 对 /scores 404，持續 ≥1 個月，279 筆 feed_log 同錯，54 筆 open bets 永不結算）
  → feed-scores-fix 已合 master（`0540faa`）：`match_feed_key` 持久化 + `resolveScoreKeys()` DB 反查 + scores 降頻（額度 ≤450 req/月）
  → **待驗證**：bhs-4 拉新 build 後觀察 feed_log 無 404、quota 月消耗達標、open bets 開始結算
- 6 天无重启记录为 09-17 快照；当前以 pm2 status 為準

## 9. 整体完成度评估

| 维度 | 评估 |
|---|---|
| 核心投注闭环 | ✅ **90%**，可投产 demo |
| 6 大系统 | 平均 **75%**（PAM/SPORTBOOK/CMS/CRM/Analytics/Support 都成型，**Support 缺知识库**） |
| 生产稳定性 | ✅ **85%**（feed scores 斷鏈已修復，待 bhs-4 上線驗證） |
| 自动化验证 | ✅ **95%**，CI 18 步全绿（unit 92 + e2e 11 verify + UI 3 + visual 8/8 + ws） |
| 文档 | ✅ **85%**，README/CHANGELOG/架构/现状/roadmap 齐（`feature/docs-system-overview` 已合） |
| 代码卫生 | ✅ **80%**，pm2 ecosystem / pnpm-workspace / 隔离 DB e2e 都齐 |

## 10. 已知技术债

- 验证基线：verify_analytics.py 硬编码 REF（应在空 DB 时跳过或自助对账）— **当前 6/19 是测试 bug 非代码 bug**
- UI e2e 在 CI 是 `|| true` 非阻塞：verify_k_ux/l_ux/m_ux 失败不会红 CI
- 监控/告警：零（进程崩了/5xx 激增/feed_log 报错无人知道）→ roadmap R9
- 数据源：FEED_API_KEY 在 `~/.betting-feed.env`（不进 git，OK）；**額度監控無告警**（免費 500/月，需人工查 the-odds-api dashboard）
- UI 文案 i18n：CMS 多语言有了，前端硬编码
- `.scratch/` 未納入版本控制：6 份 PRD + 前端 roadmap 是唯一決策記錄，應歸檔或明確棄置

## 11. 部署与运维命令速查

```bash
# bhs-4 上
export PATH="$HOME/.nvm/versions/node/v24.13.1/bin:$PATH"
cd ~/services/betting-system

# build
pnpm install
cd apps/api && pnpm build
cd ../web && pnpm build
cd ../mobile && pnpm build

# restart
pm2 restart ecosystem.config.js

# 健康
curl -s http://127.0.0.1:4100/health

# 隔离 e2e（端口 + DB 都隔离）
PORT=14100 BETTING_DB_PATH=/tmp/iso.db NODE_ENV=test node apps/api/dist/index.js &
python3 scripts/verify_accounts.py http://127.0.0.1:14100/api /tmp/iso.db
```

## 12. 变更日志

- 2026-09-17：创建本文档（beb39c6 master）
- 2026-09-17：feature/verify-core-routes 合并（+3 verify 脚本：accounts/matches/markets 共 60/60 PASS）
- 2026-09-17：git rebase + push 整合 50 commit business system 到 origin master
- 2026-09-26：合入 `feature/docs-system-overview`（本分支此前懸置 9 天未合，README 引用一直死鏈）+ 刷新至 `6d13584`：CI ✅ / Sprint 5 / WebSocket / 視覺回歸 / feed-scores-fix / Pages 進度
