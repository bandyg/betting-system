# Betting System (Amelco-style MVP)

一个像 [Amelco](https://www.amelco.co.uk/) 的完整投注系统 MVP：**赛前 + 滚球** 固定赔率、下注、结算闭环，足球/篮球/网球/棒球等 18 运动，三端（Web 后台 / 移动 Web / API）。面向学习/演示的轻量实现。

> **状态**：`beb39c6` / 6 大系统 80% 完成 / 16 route 72 endpoint / 16 验证脚本（13 绿）
> 详细现状见 [`docs/system-status.md`](docs/system-status.md)
> 架构与数据流见 [`docs/architecture.md`](docs/architecture.md)
> 缺口与下个迭代见 [`docs/roadmap.md`](docs/roadmap.md)

## 6 大系统完成度

| 系统 | 完成度 | 关键能力 |
|---|---|---|
| **PAM**（账户/支付/认证） | 80% | JWT 7d + bcrypt + 注册/充值/提现 + 风控限额 + mock 支付通道 |
| **SPORTBOOK**（核心投注） | **85%** | 18 运动 + 滚球 autoMarket + parlay 串关 + 调赔/挂盘 + the-odds-api live 接入 |
| **CMS**（内容管理） | 75% | 多语言 + 生命周期（草稿/定时/归档/恢复）+ 富文本 |
| **CRM**（营销/客户） | 80% | 促销/优惠/VIP 5 级/用户偏好 |
| **Data Analytics**（数据分析） | 70% | 仪表盘 + 14 天趋势 + 热门 Top5 + 用户画像 |
| **Customer Support**（客服工單） | 60% | 工單 + 消息 + 状态机（**缺知识库**） |

## 技术栈

- **后端 API**：Node.js 24 + TypeScript 5.7 + Express 4 + better-sqlite3 11
- **Web 后台**：React 18 + Vite 6（:4200，`/api` 反代到 :4100）
- **移动端**：Expo / RN-Web 三端共享（:4300）
- **共享层**：`packages/core`（types + api client + hooks）/ `packages/ui`（dark neon 设计系统）
- **数据库**：SQLite 3.3MB（生产），schema 见 `apps/api/src/db/schema.sql`
- **外部数据源**：the-odds-api（live，env-gated 调度 + 自动派彩开关）
- **部署**：pm2 4 进程（api / web / mobile-web / feed-worker）

## 目录结构

```
betting-system/
├── apps/
│   ├── api/          # Express REST API（:4100）— 16 route / 72 endpoint
│   │   └── src/
│   │       ├── index.ts         # 入口 + /health
│   │       ├── jwt.ts           # JWT 签发 + 验证
│   │       ├── analytics.ts     # 聚合查询
│   │       ├── risk.ts          # 业务级风控
│   │       ├── db/              # SQLite 连接 + schema.sql + 迁移
│   │       ├── routes/          # 16 route 文件
│   │       ├── payments/        # 支付 provider 抽象（mock + nowpayments）
│   │       └── feeds/           # 11 模块（the-odds-api 接入）
│   ├── web/          # Admin 后台（:4200）
│   └── mobile/       # Expo / RN-Web（:4300）
├── packages/
│   ├── core/         # 共享 types + api client + hooks
│   └── ui/           # 设计系统（dark neon theme）
├── scripts/          # 16 个 e2e 验证脚本
├── docs/             # 现状/架构/路线图
│   ├── system-status.md
│   ├── architecture.md
│   ├── roadmap.md
│   └── customer-support-plan.md
├── data/             # SQLite 数据（git 忽略）
└── ecosystem.config.js  # pm2 配置
```

## 快速开始

```bash
# 1. 装依赖（pnpm 11 + monorepo，allowBuilds 在 pnpm-workspace.yaml）
pnpm install

# 2. 构建（api 需 MSVC/对应工具链编译 better-sqlite3 native binding）
cd apps/api && pnpm build && cd -
cd apps/web && pnpm build && cd -
# mobile 可选: cd apps/mobile && pnpm build && cd -

# 3. 启动（pm2）
pm2 start ecosystem.config.js
pm2 save

# 4. 健康检查
curl -s http://127.0.0.1:4100/health
# → {"status":"ok","service":"betting-api",...}
```

> ⚠️ **native binding**：better-sqlite3 需要 node-gyp 编译。Linux glibc 预编译 OK；Windows 需 Visual Studio Build Tools 或 [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools)。

## API 一览

Base URL：`http://localhost:4100/api`

| 路由前缀 | route 文件 | 能力 |
|---|---|---|
| `/users` `/auth` | `accounts.ts` / `auth.ts` | 注册/登录/会话/充值 |
| `/matches` | `matches.ts` | 赛事 CRUD + sport/league/status 过滤 |
| `/matches/:id/markets` `/markets` | `markets.ts` | 市场 + 调赔/挂盘/开盘 |
| `/bets` | `bets.ts` | 下注（含 parlay） |
| `/matches/:id/result` `/matches/:id/settle` | `settle.ts` | 录赛果 + 派彩 |
| `/sports` `/leagues` | `sports.ts` | 运动/联赛查询 |
| `/risk/limits` | `risk.ts` | 风控限额配置（admin） |
| `/payments` | `payments.ts` | 支付通道（mock + nowpayments） |
| `/withdrawals` | `withdrawals.ts` | 提现申请/审批/打款 |
| `/crm` | `crm.ts` | 促销/优惠/VIP |
| `/cms` | `cms.ts` | 内容 CRUD + 多语言 + 生命周期 |
| `/analytics` | `analytics.ts` | 仪表盘/趋势/Top（admin） |
| `/support` | `support.ts` | 客服工單 |
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

- **Admin 后台**：http://localhost:4200（vite preview 静态站点）
  - 路径：登录 admin → 选用户/建用户 → 充值 → 建赛事+市场 → 下注 → 录赛果 → 结算 → 看余额/投注记录变化
- **移动端 Web**：http://localhost:4300（expo web，三端共享 SPA）

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
# ... 共 16 个 verify_*.{py,ts,mjs}，13 绿 + 3 UI 未跑过 + 1 空文件

kill $API_PID && rm -f /tmp/iso.db
```

详见 [docs/system-status.md §7](docs/system-status.md#7-验证脚本覆盖)。

## pm2 运维

```bash
pm2 status                 # betting-api / betting-web / betting-mobile-web / betting-feed-worker
pm2 logs betting-api       # API 日志
pm2 restart betting-api    # 重启 API
pm2 delete ecosystem.config.js  # 全部下线
```

## 文档

| 文档 | 用途 |
|---|---|
| [docs/system-status.md](docs/system-status.md) | 现状快照：6 系统 / 16 route / 16 verify / 生产状态 |
| [docs/architecture.md](docs/architecture.md) | 模块/数据/请求/部署架构 |
| [docs/roadmap.md](docs/roadmap.md) | 22 项缺口 P0-P3 + 1.75d sprint 计划 |
| [docs/customer-support-plan.md](docs/customer-support-plan.md) | 客服工單系统设计 |
| [CHANGELOG.md](CHANGELOG.md) | 版本化变更日志 |

## 已知边界（MVP 范围外）

- 早期结算（cashout）
- 真实支付通道联调（nowpayments 留接口，沙箱未跑通）
- KYC / 反洗钱 / 多商户多租户
- 多 feed 源聚合（当前仅 the-odds-api）
- 实时大屏 / 漏斗 / cohort / BI 工具对接 / 数据导出
- 前端文案全 i18n（CMS 已多语言，UI 文案硬编码）
- PWA 离线
- License 未指定
