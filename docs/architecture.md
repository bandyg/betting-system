# Architecture — betting-system MVP

> 与 `system-status.md` 配套。本文件描述模块/数据/请求/部署架构。
> 基准 commit：初版 `beb39c6` → 2026-09-26 刷新至 `6d13584`

## 1. 顶层架构

```
┌─────────────────────────────────────────────────────────────┐
│                       External                              │
│  ┌──────────────┐  ┌────────────┐  ┌───────────────────┐  │
│  │ the-odds-api │  │ nowpayments│  │  User browsers    │  │
│  │  (feed)      │  │ (payments) │  │  (web/mobile/pwa) │  │
│  └──────┬───────┘  └─────┬──────┘  └─────────┬─────────┘  │
└─────────┼────────────────┼───────────────────┼────────────┘
          │                │                   │
          ▼                ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    bhs-4 (Tailscale)                        │
│                                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │  pm2 ecosystem (4 betting apps + 12 others) │          │
│  │  ┌────────────┐  ┌──────────┐  ┌─────────┐  │          │
│  │  │ api :4100  │  │web :4200 │  │mobile   │  │          │
│  │  │ (Express)  │  │(vite     │  │ :4300   │  │          │
│  │  │            │  │ preview) │  │(expo    │  │          │
│  │  │            │  │          │  │ web)    │  │          │
│  │  └──────┬─────┘  └────┬─────┘  └────┬────┘  │          │
│  │         │             │              │        │          │
│  │         └─────────────┴──────────────┘        │          │
│  │                       │ /api reverse-proxy    │          │
│  │                       ▼                        │          │
│  │  ┌──────────────────────────────────────┐    │          │
│  │  │       feed-worker (env-gated)        │    │          │
│  │  │   polls the-odds-api → ingest DB     │    │          │
│  │  │   + auto-settle via settings flag    │    │          │
│  │  │   + 额度治理 ≤450 req/月             │    │          │
│  │  └──────────────────────────────────────┘    │          │
│  │                                               │          │
│  │  WebSocket: api :4100 /ws/odds               │          │
│  │  （admin 调赔 → broadcast odds_batch →       │          │
│  │   web useLiveOdds 自动重连 + 心跳）          │          │
│  └──────────────────────────────────────────────┘          │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │       SQLite 3.3MB（data/betting.db）        │          │
│  │   users / accounts / markets / matches /     │          │
│  │   odds / bets / transactions / sessions /    │          │
│  │   cms / crm / risk_limits / support_tickets  │          │
│  │   feed_log / settings / jwt_secret           │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  Tailscale 100.66.5.26 (bhs-4)                             │
└─────────────────────────────────────────────────────────────┘
```

## 2. Monorepo 布局

```
betting-system/
├── apps/
│   ├── api/                  # Express + TS 后端
│   │   ├── src/
│   │   │   ├── index.ts      # 入口 + /health
│   │   │   ├── jwt.ts        # JWT 签发 + 验证
│   │   │   ├── analytics.ts  # 聚合查询
│   │   │   ├── risk.ts       # 业务级风控
│   │   │   ├── db/           # SQLite 连接 + schema.sql + 迁移
│   │   │   ├── routes/       # 16 route 文件 / 72 endpoint
│   │   │   ├── wsHub.ts      # WebSocket hub（/ws/odds 实时赔率）
│   │   │   ├── payments/     # payment provider 抽象
│   │   │   └── feeds/        # 12 模块（the-odds-api 接入）+ 3 个 __verify__*.ts
│   │   └── scripts/          # 旧的 e2e
│   │
│   ├── web/                  # admin 后台 (React + Vite)
│   │   ├── src/
│   │   │   ├── App.tsx       # SPA 主组件
│   │   │   ├── api.ts        # 后端 API client
│   │   │   ├── types.ts
│   │   │   └── styles.css
│   │   └── vite.config.ts    # dev :4200 + preview :4200 + /api proxy
│   │
│   └── mobile/               # Expo / RN-Web 三端共享
│       ├── src/
│       │   ├── app/          # expo-router pages
│       │   ├── components/   # 共享 UI
│       │   ├── hooks/
│       │   └── constants/
│       └── scripts/serve-web.mjs  # :4300 + /api 反代 + no-cache
│
├── packages/
│   ├── core/                 # 共享 types + api client + hooks
│   │   └── src/
│   │       ├── types.ts      # Match / Market / Bet / User 等
│   │       ├── api.ts        # fetch wrapper
│   │       └── hooks.ts      # useMatches / useUser 等
│   │
│   └── ui/                   # 设计系统（dark neon）
│       └── src/
│           ├── components.tsx  # Card / Button / OddsButton
│           ├── tokens.ts       # 设计 token
│           ├── theme.tsx
│           └── markdown.tsx    # 富文本
│
├── scripts/                  # 25 个验证/测试脚本（verify + unit + visual）
├── docs/                     # 设计/状态文档 + storybook + visual-baseline
├── data/                     # SQLite（git 忽略）
├── ecosystem.config.js       # pm2 4 进程
└── pnpm-workspace.yaml       # apps/* + packages/* + allowBuilds
```

## 3. 关键请求流

### 3.1 下注（happy path）

```
User (mobile/web)
   │ POST /bets {userId, marketId, selection, stake}
   ▼
Express (api:4100) → bets.ts
   │ 1. requireAuth → JWT 验证
   │ 2. 查 users + accounts → balance
   │ 3. 风控 (risk.ts) → 单笔上下限 + 赔率范围 + 日累计
   │ 4. db.transaction:
   │    a. accounts.balance -= stake
   │    b. INSERT transactions (type=bet, amount=-stake)
   │    c. INSERT bets (status=open)
   │ 5. 200 {bet, balance}
   ▼
mobile/web → 更新 UI（basket + balance）
```

### 3.2 派彩（settlement）

```
Admin → POST /matches/:id/result {homeScore, awayScore}
   ▼ matches.ts → records score
   ▼
Admin → POST /matches/:id/settle
   ▼ settle.ts
   │ db.transaction:
   │   for each market in match:
   │     determine outcome (won/lost/void) per leg (1x2/ah/ou/parlay)
   │     for each bet on market:
   │       won  → accounts.balance += stake*price, INSERT tx (payout)
   │       lost → noop
   │       void → accounts.balance += stake, INSERT tx (refund)
   ▼
bets.status = settled, matches.status = settled
```

### 3.3 Feed 接入 + 自动派彩

```
feed-worker (pm2, env-gated)
   │ every N min → feeds/scheduler.ts
   ▼
feeds/provider.ts → the-odds-api (HTTP)
   │ → JSON: {matches[], scores[]}
   ▼
feeds/mapper.ts (sport_key → internal sport/league)
   │ + filter price<=1 / dedupe / status sync
   ▼
feeds/ingest.ts
   │ db.transaction:
   │   upsert matches (by external_id)
   │   upsert markets (by external_id)
   │   upsert odds (price update or insert)
   ▼
feeds/settle.ts (if settings.feed_auto_settle=1)
   │ 1. ingest scores — scoreKeys 由 resolveScoreKeys() 决定：
   │    FEED_SCORE_KEYS env 覆盖 → DB 反查 top-N（match_feed_key 分组）→ fallback
   │    （upcoming 只对 /odds 合法，绝不进 /scores —— 09-21 断链根因）
   │ 2. for each match with score: settle (idempotent)
```

## 4. 数据库 schema（核心表）

```
users (id, name, password[bcrypt], role[user|admin|support], created_at)
accounts (id, user_id[FK], balance, updated_at)
transactions (id, account_id, type[deposit|withdraw|bet|payout|refund|adjust], amount, created_at)
sessions (token, user_id, expires_at)  -- JWT 持久化
settings (key, value)  -- jwt_secret, feed_auto_settle, feed_manual...

matches (id, home_team, away_team, kickoff_time, status[scheduled|live|finished|settled],
         home_score, away_score, external_id, source[manual|feed],
         sport, league, match_feed_key, created_at)  -- match_feed_key: feed-scores-fix 加，scores 反查用
markets (id, match_id, type[1x2|ah|ou], line, status[open|suspended|settled],
         external_id, source, created_at)
odds (id, market_id, selection, price, UNIQUE(market_id, selection))

bets (id, user_id, market_id, selection, stake, price, status[open|won|lost|void|settled],
      leg_id[parlay], created_at, settled_at)

risk_limits (id, market_id|user_id, max_stake, max_payout, daily_limit, ...)
support_tickets (id, user_id, subject, status[open|waiting_user|waiting_support|closed], priority, ...)
support_messages (id, ticket_id, author_user_id, body, created_at)
cms_contents (id, slug, title, body[markdown], locale, status[draft|scheduled|published|archived], ...)
crm_promotions (id, code, type, value, status, valid_from, valid_to, wagering_req, ...)
crm_claims (id, user_id, promotion_id, status, claimed_at, settled_at, ...)
crm_vip_tiers (user_id, tier[bronze|silver|gold|platinum|diamond], progress, total_wagered)

feed_log (provider, requested_at, status, matches_seen, matches_upserted, errors)
```

## 5. 认证 / 授权

```
POST /users  → 公开注册
   → 写 users + accounts
   → signSessionToken(userId)  [HS256, jwt_secret from settings]
   → INSERT sessions (token, user_id, expires_at)
   → 返回 {user, token}
   │
   ▼
POST /auth/login {name, password}
   → bcrypt.compare(password, users.password)  [lazy upgrade from SHA-256]
   → 5 fails / 5 min → 429
   → sign + sessions → return token
   │
   ▼
每个受保护 route:
   requireAuth → 从 Authorization: Bearer 取 token
              → 查 sessions 表（确保未撤销）
              → 解 JWT → res.locals.user = {id, role}
   requireRole('admin') → 检查 role
```

## 6. 前端架构

```
apps/web (React + Vite, :4200)
   ├─ SPA, vite preview (production)
   ├─ 路由: hash 路由（无 react-router）
   ├─ 状态: useState + useEffect（无 redux）
   ├─ API: packages/core api.ts (fetch + JWT)
   └─ UI: packages/ui Card/Button/OddsButton

apps/mobile (Expo / RN-Web, :4300)
   ├─ expo-router (file-based, web output single-page SPA)
   ├─ 三端共享 (iOS / Android / Web)
   ├─ Cache-Control: no-cache (避免 hydration 空白)
   └─ metro monorepo + @betting/core + @betting/ui
```

## 7. 部署与运维

### 7.1 pm2 ecosystem

```
betting-api        :4100  apps/api/dist/index.js
betting-web        :4200  pnpm preview --host 0.0.0.0
betting-mobile-web :4300  apps/mobile via serve-web.mjs
betting-feed-worker       env-gated（FEED_API_KEY 就绪则调度，intervalMin=240）
```

### 7.1b CI/CD（GitHub Actions）

```
ci.yml    push/PR → pnpm install + build + 隔离 API :14100
          → 11 verify_*.py + verify_health.mjs + 3 UI e2e（|| true）
          → unit 92 + visual 8/8 + WebSocket odds
pages.yml push master 触 docs/** → Storybook + visual-baseline 部署 Pages
          （需 repo Settings → Pages 手动启用一次）
```

### 7.2 启动顺序

```
1. pnpm install
2. cd apps/api && pnpm build   # tsc strict
3. cd apps/web && pnpm build   # vite build
4. cd apps/mobile && pnpm build # expo export
5. pm2 start ecosystem.config.js
6. pm2 save
```

### 7.3 隔离 e2e 模式

```bash
# 起 second API 跑测试
PORT=14100 BETTING_DB_PATH=/tmp/iso.db NODE_ENV=test node apps/api/dist/index.js &
python3 scripts/verify_accounts.py http://127.0.0.1:14100/api /tmp/iso.db
# 测试完 kill + rm /tmp/iso.db
```

## 8. 数据流（业务核心）

```
                        ┌────────────┐
                        │  the-odds  │
                        │   -api     │
                        └─────┬──────┘
                              │ poll every N min (env-gated)
                              ▼
            ┌──────────────────────────────────┐
            │  feeds/scheduler → provider     │
            │  → mapper → ingest (DB upsert)  │
            │  → if feed_auto_settle:          │
            │     ingest scores → settle.ts    │
            └──────────┬───────────────────────┘
                       │
                       ▼
    ┌────────────────────────────────────────┐
    │         SQLite data/betting.db         │
    │  matches / markets / odds / bets / ... │
    └────────┬───────────────────────────────┘
             │
   ┌─────────┼─────────┐
   ▼         ▼         ▼
 admin     user      user
 (web)   (mobile)   (web)
```

## 9. 风险与限制

- **SQLite 单点**：单文件 3.3MB，无 replica/备份策略（data/.bak 散落，已 gitignore 修复）
- **JWT secret 单点**：存在 settings 表首启动随机生成；replica 后所有实例需读同一 secret
- **feed 单源**：仅 the-odds-api；多源聚合未实现
- **feed 額度**：免費 500 req/月，已治理到 ≤450（scores 降頻 + limit=3），但無自動告警，需人工查 dashboard
- **支付单通道**：mock 完整，nowpayments 留接口未联调
- **无 rate limit**（除 login 5/5min）：注册、下注、提现等无全局限流
- **无审计日志**：admin 操作无 audit trail
- **UI e2e 非阻塞**：CI 中 verify_{k,l,m}_ux 是 `|| true`，红了不挡合并

## 10. 演进路径（详见 roadmap.md）

按 ROI 排序的下一步（详见 roadmap.md；~~划线~~为已完成）：
1. ~~README + CHANGELOG（开发者 onboarding）~~ ✅ 09-19
2. ~~CI（.github/workflows）~~ ✅ 09-20（18 步全绿）
3. 验证基线修复（verify_analytics.py 硬编码 REF）
4. ~~UI e2e 跑通（k/l/m_ux）~~ ✅ 进 CI（但非阻塞，见 §9）
5. Customer Support 知识库
6. Customer 分群与营销自动化
7. 实时数据大屏 + cohort 分析
8. 多源 feed 聚合
9. Sentry + 监控告警
