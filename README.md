# Betting System (Amelco-style MVP)

一个像 Amelco 的完整投注系统 MVP：**赛前固定赔率 + 下注 + 结算闭环**（足球 + 胜平负/让球/大小 + 账户余额），单渠道 Web。

> 参考：[Amelco 官网](https://www.amelco.co.uk/) 的系统概述。本项目是面向学习/演示的轻量实现，暂不含实时交易、风控、CMS、多语言、多渠道。

## 技术栈

- **API**: Node.js 24 + TypeScript + Express + better-sqlite3
- **Web**: React 18 + Vite 6（单页，`vite preview` 托管静态产物 + `/api` 反向代理到 API）
- **数据库**: SQLite（`data/betting.db`，schema 见 `apps/api/src/db/schema.sql`）
- **部署**: pm2（`ecosystem.config.js`）

## 目录结构

```
betting-system/
├── apps/
│   ├── api/          # Express REST API（:4100）
│   │   └── src/
│   │       ├── index.ts        # 入口 + /health
│   │       ├── db/             # SQLite 连接 + schema.sql + 迁移
│   │       └── routes/         # accounts / matches / markets / bets / settle
│   └── web/          # React 单页（:4200，/api 代理到 :4100）
├── data/             # SQLite 数据文件（git 忽略）
└── ecosystem.config.js  # pm2 配置
```

## 快速开始

```bash
# 安装依赖（pnpm workspace）
pnpm install

# 构建
cd apps/api && pnpm build
cd ../web && pnpm build

# 启动（pm2）
pm2 start ecosystem.config.js
pm2 save
```

## API 一览

Base URL: `http://localhost:4100/api`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（根路径，无 /api 前缀） |
| POST | `/users` | 创建用户 `{name}` → `{user:{id, account_id, balance}}` |
| GET | `/users` | 用户列表（含余额） |
| GET | `/users/:id` | 单个用户（含余额） |
| POST | `/users/:id/deposit` | 充值 `{amount}` → `{account:{balance}, transaction:{...}}` |
| POST | `/matches` | 建赛事 `{homeTeam, awayTeam, kickoffTime}` |
| GET | `/matches` | 赛事列表（含市场+赔率） |
| GET | `/matches/:id` | 赛事详情（含市场+赔率） |
| POST | `/matches/:id/markets` | 建市场+赔率 `{type: 1x2\|ah\|ou, line?, odds:{sel:price}}` |
| GET | `/markets/:id` | 市场详情（含赔率） |
| POST | `/bets` | 下注 `{userId, marketId, selection, stake}` → 扣余额+建单 |
| GET | `/bets?userId=` | 投注列表（可按用户过滤） |
| GET | `/bets/:id` | 投注详情 |
| POST | `/matches/:id/result` | 录赛果 `{homeScore, awayScore}` |
| POST | `/matches/:id/settle` | 结算（单事务：赢家派彩 / 输家没收 / 平盘 void 退款） |

### 市场类型与选择

| 类型 | 含义 | 选择项 | 备注 |
|------|------|--------|------|
| `1x2` | 胜平负 | `home` / `draw` / `away` | 无 line |
| `ah` | 亚洲让球 | `home` / `away` | line 非零，如 -1.5 / +0.5 |
| `ou` | 大小球 | `over` / `under` | line 非零，如 2.5 |

### 结算规则

- 赢家：余额 + `stake × price`（派彩流水，type=payout）
- 输家：无返还
- 平盘（让球整数盘恰好命中盘口）：void 退款（type=refund）

## 业务闭环示例

```bash
# 1. 创建用户 + 充值
curl -X POST localhost:4100/api/users -H 'Content-Type: application/json' -d '{"name":"alice"}'
curl -X POST localhost:4100/api/users/1/deposit -H 'Content-Type: application/json' -d '{"amount":1000}'

# 2. 建赛事 + 市场
curl -X POST localhost:4100/api/matches -H 'Content-Type: application/json' \
  -d '{"homeTeam":"FC A","awayTeam":"FC B","kickoffTime":"2026-08-20T19:00:00Z"}'
curl -X POST localhost:4100/api/matches/1/markets -H 'Content-Type: application/json' \
  -d '{"type":"1x2","odds":{"home":2.10,"draw":3.40,"away":3.20}}'

# 3. 下注
curl -X POST localhost:4100/api/bets -H 'Content-Type: application/json' \
  -d '{"userId":1,"marketId":1,"selection":"home","stake":100}'

# 4. 录赛果 + 结算
curl -X POST localhost:4100/api/matches/1/result -H 'Content-Type: application/json' -d '{"homeScore":2,"awayScore":1}'
curl -X POST localhost:4100/api/matches/1/settle
```

## Web 演示

- 访问 `http://localhost:4200`（vite preview 静态站点）
- 操作路径：选用户/建用户 → 充值 → 建赛事+市场 → 下注 → 录赛果 → 结算 → 看余额/投注记录变化

## 开发

```bash
cd apps/api && pnpm dev     # tsx watch :4100
cd apps/web && pnpm dev     # vite dev :4200
```

## 测试

端到端验证脚本：`apps/api/scripts/e2e.mjs`（覆盖 建用户→充值→建赛→建市场→下注→录赛果→结算→余额断言 + 负例）。运行：

```bash
node apps/api/scripts/e2e.mjs
```

> 注：e2e 脚本用时间戳后缀隔离每次运行的测试数据，可重复执行。

## pm2 运维

```bash
pm2 status                # 查看 betting-api / betting-web
pm2 logs betting-api      # API 日志
pm2 restart betting-api   # 重启 API
pm2 delete ecosystem.config.js   # 全部下线
```

## 已知边界（MVP 范围外）

- 无实时滚球 / 交易引擎 / 风控 / CMS
- 无用户认证（单用户直接用 userId 操作，演示用）
- 无多语言 / 多渠道（仅 Web）
- SQLite 单机存储（后续可迁 PostgreSQL）
# 本機測試 - betting-system verification
