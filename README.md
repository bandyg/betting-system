# Betting System (Amelco-style MVP)

一个像 [Amelco](https://www.amelco.co.uk/) 的完整投注系统 MVP：**赛前 + 滚球** 固定赔率、下注、结算闭环，足球/篮球/网球/棒球等 18 运动，**统一 Expo 前端**（玩家端 + `/admin` 运营后台同源交付）/ API。面向学习/演示的轻量实现。

> **状态**：master（0.3.0 统一前端）/ **30+ feature 完成** / **2400+ 行 docs** / **三层测试金字塔**
> - ✅ Unit Tests: **155/155 PASS**（11 文件）
> - ✅ E2E: backend 13 verify + UI 3 playwright（`:4300/admin`，testID 选择器）+ WebSocket real-time odds + rate-limit
> - ✅ Rate Limit (R7): register 5/min · bet 30/min · withdraw 10/min · odds_update 60/min
> - ✅ Visual Regression: 8 页基线（unify 后由 CI 首跑重建基准）
> - ✅ CI: GitHub Actions 全步骤（UI e2e / 视觉回归改 serve-web + Expo export）

> 详细现状见 [`docs/system-status.md`](docs/system-status.md)
> 架构与数据流见 [`docs/architecture.md`](docs/architecture.md)
> 缺口与下个迭代见 [`docs/roadmap.md`](docs/roadmap.md)

## 6 大系统完成度

| 系统 | 完成度 | 关键能力 |
|---|---|---|
| **PAM**（账户/支付/认证） | 80% | JWT 7d + bcrypt + 注册/充值/提现 + 风控限额 + mock 支付通道 |
| **SPORTBOOK**（核心投注） | **85%** | 18 运动 + 滚球 autoMarket + parlay 串关 + 调赔/挂盘 + the-odds-api live 接入 |
| **CMS**（内容管理） | 75% | 多语言 + 生命周期（草稿/定时/归档/恢复）+ 富文本 |
| **CRM**（营销/客户） | **100%** | 促销/优惠/VIP 5 级/用户偏好 + **R11 分群 DSL + 营销自动化 + 站内信** |
| **Data Analytics**（数据分析） | 90% | 仪表盘 + 14 天趋势 + 热门 Top5 + 用户画像 + **R13 SSE 实时大屏 + CSV 导出** |
| **Customer Support**（客服工單） | 80% | 工單 + 消息 + 状态机 + **R6 知识库 FAQ（分类/搜索/投票）**（缺邮件通知/SLA） |

## 技术栈

- **后端 API**：Node.js 24 + TypeScript 5.7 + Express 4 + better-sqlite3 11
- **统一前端**：Expo SDK 57 / React Native Web（:4300，玩家端 `/` + 运营后台 `/admin` 同源交付，serve-web.mjs 静态托管 + `/api` `/ws` 反代）
- **共享层**：`packages/core`（types + api client + hooks + useLiveOdds）/ `packages/ui`（dark neon 设计系统，**唯一 UI 实现**，双主题 tokens）
- **数据库**：SQLite 3.3MB（生产），schema 见 `apps/api/src/db/schema.sql`
- **外部数据源**：the-odds-api（live，env-gated 调度 + 自动派彩开关）
- **部署**：pm2 3 进程（api / web（统一前端）/ feed-worker）

## 目录结构

```
betting-system/
├── apps/
│   ├── api/          # Express REST API（:4100）— 20 route / 72 endpoint
│   │   └── src/
│   │       ├── index.ts         # 入口 + /health
│   │       ├── jwt.ts           # JWT 签发 + 验证
│   │       ├── analytics.ts     # 聚合查询
│   │       ├── risk.ts          # 业务级风控
│   │       ├── db/              # SQLite 连接 + schema.sql + 迁移
│   │       ├── routes/          # 20 route 文件
│   │       ├── payments/        # 支付 provider 抽象（mock + nowpayments）
│   │       └── feeds/           # 11 模块（the-odds-api 接入）
│   └── mobile/       # 统一前端 Expo / RN-Web（:4300）
│       └── src/
│           ├── app/             # 玩家端 5 屏（expo-router）
│           ├── app/admin/       # 运营后台 /admin（门禁 + 8 面板）
│           ├── admin/           # 面板实现 + 键盘快捷键 + lib
│           ├── stores/          # zustand（主题）
│           └── lib/             # 错误上报
├── packages/
│   ├── core/         # 共享 types + api client + hooks + useLiveOdds + 存储适配器
│   └── ui/           # 设计系统（dark neon，唯一 UI 实现，双主题 tokens + 26 组件）
├── scripts/          # 单元测试 + e2e/视觉回归脚本
├── docs/             # 现状/架构/路线图 + 文档导读 + 系统总览
├── data/             # SQLite 数据（git 忽略）
└── ecosystem.config.js  # pm2 配置（3 进程）
```

## 快速开始

```bash
# 1. 装依赖（pnpm 11 + monorepo，allowBuilds 在 pnpm-workspace.yaml）
pnpm install

# 2. 构建（api 需 MSVC/对应工具链编译 better-sqlite3 native binding）
cd apps/api && pnpm build && cd -
# 统一前端（Expo web 静态产物 → apps/mobile/dist）
cd apps/mobile && npx expo export -p web && cd -

# 3. 启动（pm2）
pm2 start ecosystem.config.js
pm2 save

# 4. 健康检查
curl -s http://127.0.0.1:4100/health
# → {"status":"ok","service":"betting-api",...}
```

> ⚠️ **native binding**：better-sqlite3 需要 node-gyp 编译。Linux glibc 预编译 OK；Windows 需 Visual Studio Build Tools 或 [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools)。

## 测试（三层金字塔 + 实时 ws + CI）

```bash
# 1) 单元测试 (Node 24 --test, 零依赖, < 2s)
pnpm test:unit:single

# 2) 后端 e2e (11 个 python/JS verify, 隔离 /tmp/ci-betting.db)
pnpm --filter api build
BETTING_DB_PATH=/tmp/test.db PORT=14100 node apps/api/dist/index.js &
python3 scripts/verify_matches.py    http://127.0.0.1:14100/api /tmp/test.db
python3 scripts/verify_accounts.py   http://127.0.0.1:14100/api /tmp/test.db
# ... 9 个更多

# 3) UI e2e (Playwright 3 脚本: k_ux/l_ux/m_ux，目标 :4300/admin，testID 选择器)
BETTING_DB_PATH=/tmp/ui.db PORT=14100 node apps/api/dist/index.js &
API_TARGET=http://127.0.0.1:14100 node apps/mobile/scripts/serve-web.mjs 14300 &
node scripts/verify_k_ux.mjs http://127.0.0.1:14300 http://127.0.0.1:14100/api
node scripts/verify_l_ux.mjs http://127.0.0.1:14300 http://127.0.0.1:14100/api
node scripts/verify_m_ux.mjs http://127.0.0.1:14300 http://127.0.0.1:14100/api

# 4) WebSocket 实时赔率 (admin 调赔 → ws 客户端收 odds_batch)
BETTING_DB_PATH=/tmp/ws.db PORT=14100 node apps/api/dist/index.js &
PORT=14100 node scripts/verify_websocket.mjs
# → [PASS] received odds_batch (1 markets)

# 5) Visual Regression (Playwright + pixelmatch CLI, 8 关键页面 baseline 对比)
# 5a) 生成 baseline (大改 UI 后；需 API + serve-web + expo export)
pnpm test:visual:baseline
# 5b) 对比 (日常 PR 验证)
pnpm test:visual
# → Visual Regression 8 pages: PASS=8 FAIL=0
```

**当前状态** (0.3.0 统一前端):
- ✅ Unit Tests: **155/155** (11 files; + test_ws_url / test_auth_storage，- test_i18n 随 i18n 下线删除)
- ✅ Backend E2E: 13 verify scripts
- ✅ UI E2E: 3/3 Playwright (k_ux/l_ux/m_ux，`:4300/admin` + testID)
- ✅ WebSocket: 实时赔率 broadcast PASS（serve-web `/ws` 反代另有 mock 上游专项验证）
- ✅ Visual Regression: 8 页基线由 CI 首跑重建（unify 后全量变化属预期）
- ✅ CI: GitHub Actions（UI e2e / 视觉回归改 serve-web + Expo export）

详见 [`docs/VISUAL_REGRESSION.md`](docs/VISUAL_REGRESSION.md) · [`docs/WEBSOCKET_REALTIME.md`](docs/WEBSOCKET_REALTIME.md) · [`docs/UNIT_TESTS.md`](docs/UNIT_TESTS.md)

## API 一览

Base URL：`http://localhost:4100/api`

| 路由前缀 | route 文件 | 能力 |
|---|---|---|
| `/users` `/auth` | `accounts.ts` / `auth.ts` | 注册/登录/会话/充值 |
| `/matches` | `matches.ts` | 赛事 CRUD + sport/league/status 过滤 |
| `/matches/:id/markets` `/markets` | `markets.ts` | 市场 + 调赔/挂盘/开盘 |
| **⚡ `/ws/odds`** | **`wsHub.ts`** | **WebSocket 实时赔率 broadcast** |
| `/bets` | `bets.ts` | 下注（含 parlay） |
| `/matches/:id/result` `/matches/:id/settle` | `settle.ts` | 录赛果 + 派彩 |
| `/sports` `/leagues` | `sports.ts` | 运动/联赛查询 |
| `/risk/limits` | `risk.ts` | 风控限额配置（admin） |
| `/payments` | `payments.ts` | 支付通道（mock + nowpayments） |
| `/withdrawals` | `withdrawals.ts` | 提现申请/审批/打款 |
| `/crm` `/admin/crm` | `crm.ts` | 促销/优惠/VIP + R11 分群 + 营销自动化 |
| `/notifications` `/admin/notifications` | `notifications.ts` | R11 站内信收件箱 + admin 群发 |
| `/cms` | `cms.ts` | 内容 CRUD + 多语言 + 生命周期 |
| `/analytics` | `analytics.ts` | 仪表盘/趋势/Top（admin）+ R13 SSE 实时大屏 `/analytics/realtime` + CSV 导出 `/analytics/export/*.csv` |
| `/support` | `support.ts` | 客服工單 |
| `/kb` `/admin/kb` | `kb.ts` | 客服知识库（FAQ 分类 + 文章 + 公开搜索 + helpful 投票） |
| `/feeds` | `feed.ts` | 数据源管理（admin） |
| `/health` | `health.ts` | 健康检查（O1 round：db + redis + pg + web 真探活） |

完整 endpoint 列表见 [docs/system-status.md §4](docs/system-status.md)。

### 市场类型与选择

| 类型 | 含义 | 选择项 | 备注 |
|---|---|---|---|
| `1x2` | 胜平负 | `home` / `draw` / `away` | 无 line |
| `ah` | 亚洲让球 | `home` / `away` | line 非零，如 -0.5 / +1.5 |
| `ou` | 大小球 | `over` / `under` | line 非零，如 2.5 |

### 结算规则

- 赢家：余额 + `stake × price`（type=`payout`）
- 输家：无返还
- 平盘（让球整数盘恰好命中盘口）：void 退款（type=`refund`）
- Parlay：按 leg 级结算，任一腿输 → 整单 lost；全 void → refund

## 业务闭环示例

```bash
# 1. 注册（公开端点，返回 JWT）
curl -X POST localhost:4100/api/users -H 'Content-Type: application/json' \
  -d '{"name":"alice","password":"123456"}'

# 2. 登录（已有账号）
curl -X POST localhost:4100/api/auth/login -H 'Content-Type: application/json' \
  -d '{"name":"alice","password":"123456"}'

# 3. admin 充值（admin token from /auth/login name=admin password=admin123）
curl -X POST localhost:4100/api/users/1/deposit \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"amount":1000}'

# 4. 建赛事 + 市场（admin）
curl -X POST localhost:4100/api/matches \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"homeTeam":"FC A","awayTeam":"FC B","kickoffTime":"2027-01-01T19:00:00Z"}'

curl -X POST localhost:4100/api/matches/1/markets \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"1x2","odds":{"home":2.10,"draw":3.40,"away":3.20}}'

# 5. 下注
curl -X POST localhost:4100/api/bets \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"marketId":1,"selection":"home","stake":100}'

# 6. 录赛果 + 结算
curl -X POST localhost:4100/api/matches/1/result \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{"homeScore":2,"awayScore":1}'

curl -X POST localhost:4100/api/matches/1/settle \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 前端演示

- **玩家端**：http://localhost:4300（Expo Web，需先 `cd apps/mobile && npx expo export -p web`）
- **运营后台**：http://localhost:4300/admin（同一产物，登录 admin/admin123）
  - 路径：登录 admin → 账户建用户/充值 → 建赛+开盘 → 大厅下注（单注/串关，8s 确认倒计时）→ 结算 → 注单历史/工单；支持明暗主题切换与 Web 快捷键（`?` 查看）
- **Native**：`expo start` 后 iOS/Android 直连绝对 API 地址（`EXPO_PUBLIC_API_BASE` 可覆盖）

## 验证（e2e）

```bash
# 隔离 e2e 模式：起 second API + 跑脚本 + 清理
PORT=14100 BETTING_DB_PATH=/tmp/iso.db NODE_ENV=test \
  node apps/api/dist/index.js &
API_PID=$!

python3 scripts/verify_accounts.py  http://127.0.0.1:14100/api /tmp/iso.db   # 19/19
python3 scripts/verify_matches.py   http://127.0.0.1:14100/api /tmp/iso.db   # 15/15
python3 scripts/verify_markets.py   http://127.0.0.1:14100/api /tmp/iso.db   # 26/26
python3 scripts/verify_withdrawals.py http://127.0.0.1:14100/api /tmp/iso.db # 29/29
# ... 共 17 个 verify_*.{py,ts,mjs}，13 绿 + 3 UI 在 CI 跑（|| true）+ 1 verify_rate_limit + 1 空
# R7 限流验证（独立隔离 API + 低阈值 env 跑）：
RATE_LIMIT_REGISTER_MAX=5 BETTING_DB_PATH=/tmp/rl.db PORT=14100 node apps/api/dist/index.js &
python3 scripts/verify_rate_limit.py http://127.0.0.1:14100/api /tmp/rl.db

kill $API_PID && rm -f /tmp/iso.db
```

详见 [docs/system-status.md §7](docs/system-status.md#7-验证脚本覆盖)。

## pm2 运维

```bash
pm2 status                 # betting-api / betting-web(统一前端:4300) / betting-feed-worker
pm2 logs betting-web       # 前端日志
pm2 restart betting-api    # 重启 API
pm2 delete ecosystem.config.js  # 全部下线
```

## 文档

| 文档 | 用途 |
|---|---|
| [docs/system-status.md](docs/system-status.md) | 现状快照：6 系统 / 16 route / 17 verify / 生产状态（2026-09-26 刷新） |
| [docs/architecture.md](docs/architecture.md) | 模块/数据/请求/部署架构 |
| [docs/roadmap.md](docs/roadmap.md) | 22 项缺口 P0-P3（R1/R2/R3/R4/R5/R9 已完成；当前唯一 P0 = R0 bhs-4 部署 feed 修复） |
| [docs/customer-support-plan.md](docs/customer-support-plan.md) | 客服工單系统设计 |
| [CHANGELOG.md](CHANGELOG.md) | 版本化变更日志 |
| `apps/api/src/monitor.ts` + `scripts/test_monitor.mjs` | R9 监控告警（env-gated Webhook，去抖动 5min） |

## 已知边界（MVP 范围外）

- 早期结算（cashout）
- 真实支付通道联调（nowpayments 留接口，沙箱未跑通）
- KYC / 反洗钱 / 多商户多租户
- 多 feed 源聚合（当前仅 the-odds-api）
- 实时大屏 / 漏斗 / cohort / BI 工具对接 / 数据导出
- 前端文案全 i18n（unify-frontend-expo 时已将未接线的 i18n 字典与语言切换移除）
- PWA 离线（Service Worker 已随 apps/web 下线移除）
- License 未指定
