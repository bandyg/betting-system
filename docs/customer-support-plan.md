# Customer Support（工單）系統 — 設計與實作計畫

> 本文檔是**設計 + Plan + 驗收準則**，供實作階段直接照抄。只新增本文件，不改任何既有 `.ts/.sql/.js`。
> 對照六大系統：PAM / SPORTBOOK / CMS / CRM / Data Analytics 已落地，本文件補齊 **Customer Support（工單）**。

---

## 1. 範圍與目標

### 1.1 範圍（本階段做）

- 使用者端（user）：
  - 創建工單：分類、主題、初始內容、可選優先級。
  - 查看自己的工單列表（狀態篩選 + 分頁）。
  - 查看單張工單詳情 + 完整訊息串。
  - 在自己的工單回覆（僅在 `open / in_progress / waiting_user` 狀態可回覆）。
- 客服端（support agent / admin）：
  - 列出**所有**工單（狀態/分類/使用者篩選 + 分頁）。
  - 查看任意工單 + 訊息串。
  - 客服回覆（作者角色標記為 `agent`）。
  - 改狀態：`open → in_progress → waiting_user → resolved → closed` 狀態流，含合法流轉白名單。
- 角色模型：`user`（提單/回覆）與 `support`（客服）兩種新職責；`admin` 繼承客服全部權限（示範環境下 admin 即客服）。
- 關閉鎖定：工單進入 `resolved` 或 `closed` 後，任何一方都不能再回覆；`closed` 為終態，不可再流轉。

### 1.2 不做（本階段明確排除）

- 即時聊天 / WebSocket / 在線客服窗口。
- 工單自動轉派、SLA、工單量排隊（分配 `assigned_to` 暫緩）。
- 附件上傳、富文本（一律純文字）。
- 工單 reopen / 反饋評分 / 滿意度調查。
- 郵件 / SMS / 推送通知。
- 客服知識庫 / FAQ 自動回復。
- 與滾球、支付通道、風控、Analytics 的整合（不觸碰這些模組）。

### 1.3 設計決策摘要（後文會詳述）

1. **狀態集合固定為 5 值**：`open, in_progress, waiting_user, resolved, closed`；合法流轉用 code 層白名單表，非法流轉回 `409`。
2. **分類用 CHECK 欄位**而非查詢表（與 schema.sql 現有 `type/status` CHECK 風格一致），靜態列表由 `GET /api/support/categories` 提供。
3. **優先級欄位**：`priority` 可選、預設 `normal`。
4. **首條內容存 `tickets.body`**（列表可免 JOIN 直接顯示），後續回覆存 `support_messages`；`body` 不重複寫入 messages 表。
5. **客服權限**：新增 `support` 角色值 + `requireSupport` 中間件（`admin` 或 `support` 可過），不改動既有 `requireRole` 簽名，所有既有 admin-only 路由不受影響。
6. **冪等遷移**：新表全部 `CREATE TABLE IF NOT EXISTS`，放 schema.sql 末尾 + `migrate()` 不需 ALTER；重啟/重跑多次不報錯。

---

## 2. 資料模型

### 2.1 新表：`support_tickets`

```sql
-- ============ Customer Support（工单） ============
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),          -- 提单人（作者）
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('deposit_withdrawal', 'betting', 'account', 'technical', 'other')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,                                      -- 首条内容（列表免 JOIN 展示）
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  closed_by INTEGER REFERENCES users(id),                  -- 关闭/完结人（客服）
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets(user_id, status);
```

欄位說明（貼合 schema.sql 慣例：`INTEGER PRIMARY KEY AUTOINCREMENT`、`datetime('now')`、內聯 CHECK）：

| 欄位 | 類型/約束 | 說明 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL REFERENCES users(id) | 作者，外鍵到既有 `users` |
| `category` | TEXT NOT NULL DEFAULT 'other' CHECK(...) | 分類，5 選 1 |
| `subject` | TEXT NOT NULL | 主題，非空 |
| `body` | TEXT NOT NULL | 首條內容，非空 |
| `priority` | TEXT NOT NULL DEFAULT 'normal' CHECK(...) | 優先級，可選 |
| `status` | TEXT NOT NULL DEFAULT 'open' CHECK(...) | 工單狀態（見 §2.3 流轉） |
| `closed_by` | INTEGER REFERENCES users(id) | 轉為 `closed` 時的客服 user_id |
| `closed_at` | TEXT | 轉為 `closed` 的時間 |
| `created_at` / `updated_at` | TEXT NOT NULL DEFAULT (datetime('now')) | 與既有表一致；`updated_at` 在狀態變更/新訊息時更新 |

### 2.2 新表：`support_messages`

```sql
CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id),
  author_user_id INTEGER NOT NULL REFERENCES users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('user', 'agent')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);
```

| 欄位 | 類型/約束 | 說明 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `ticket_id` | INTEGER NOT NULL REFERENCES support_tickets(id) | 外鍵到工單；刪工單需先清訊息（見 §6 風險） |
| `author_user_id` | INTEGER NOT NULL REFERENCES users(id) | 發言人（agent 回覆時為客服 user_id） |
| `author_role` | TEXT NOT NULL CHECK(...) | `user` = 使用者，`agent` = 客服 |
| `content` | TEXT NOT NULL | 訊息內容，非空 |
| `created_at` | TEXT NOT NULL DEFAULT (datetime('now')) | |

> 決策：首條內容放 `tickets.body`，`support_messages` 只存**後續**回覆。`GET detail` 返回 `ticket.body`（原始）+ `messages[]`（回覆串，按 id 升序），訊息數量驗證即數 `messages.length`。

### 2.3 狀態流（合法流轉白名單，code 層 `Record<string,string[]>` 硬編碼）

```
open         → in_progress | waiting_user | resolved | closed
in_progress  → waiting_user | resolved | closed
waiting_user → in_progress | resolved | closed
resolved     → closed
closed       → （終態，不可流轉）
```

- 使用者回覆：僅 `open / in_progress / waiting_user` 可回；若當前為 `waiting_user`，回覆後自動 `→ in_progress`（`updated_at` 同時刷新）。
- 客服回覆：僅 `open / in_progress / waiting_user` 可回；若當前為 `open`，回覆後自動 `→ in_progress`。
- 轉 `closed` 時寫 `closed_by = 當前操作者 user_id`、`closed_at = datetime('now')`。

---

## 3. API 路由（Express）

新增檔案：`apps/api/src/routes/support.ts`，導出 `supportRouter`；在 `apps/api/src/index.ts` 註冊 `app.use('/api', supportRouter)`。
中間件：既有 `requireAuth` + 新增 `requireSupport`（見 §6 邊界；加法式新增到 `routes/middleware.ts`，不改既有 `requireRole` 簽名）。

```ts
// middleware.ts 新增（不修改既有函数）
export function requireSupport(req: Request, res: Response, next: NextFunction) {
  const u = res.locals.user as AuthedUser | undefined;
  if (!u || (u.role !== 'admin' && u.role !== 'support')) {
    return res.status(403).json({ error: '仅客服或管理员可执行此操作' });
  }
  next();
}
```

通用錯誤 shape：`{ "error": "<中文原因>" }`。所有受保護路由匿名訪問一律 `401`。

### 3.1 使用者端（`requireAuth`）

#### `POST /api/support/tickets` — 建單
- 請求體：`{ "category": "deposit_withdrawal", "subject": "充值未到账", "body": "我充了100块没到账", "priority": "high" }`
- 驗證：`subject`/`body` 非空字串（trim 後）→ 否則 `400 {error:'subject is required'}` / `{error:'body is required'}`；`category` 不在集合 → `400 {error:'invalid category'}`；`priority` 若有值且不在集合 → `400`。
- 寫入：單筆 transaction：INSERT `support_tickets`（`user_id = res.locals.user.id`）。
- **201** `{ "ticket": { id, user_id, category, subject, body, priority, status:'open', closed_by:null, closed_at:null, created_at, updated_at } }`

#### `GET /api/support/tickets?status=&category=&page=&pageSize=` — 我的工單（分頁）
- 僅返回自己（`WHERE user_id = 登入者`）。若帶非管理員 `userId` 參數 → `403`（同 bets.ts 慣例）。
- `status`/`category` 有值但不在集合 → `400`。
- `page`/`pageSize`：正整數，預設 `1`/`20`，`pageSize` 上限 `100`，非法 → `400`。
- **200** `{ "count": <本页条数>, "total": <总条数>, "page": 1, "pageSize": 20, "tickets": [ ... ] }`（`ORDER BY id DESC`）

#### `GET /api/support/tickets/:id` — 看單 + 訊息
- `:id` 非正整數 → `400`；不存在 → `404 {error:'ticket not found'}`。
- 非作者且非 `admin/support` → `403 {error:'只能查看自己的工单'}`。
- **200** `{ "ticket": { ...含 user_name }, "messages": [ { id, ticket_id, author_user_id, author_role, content, created_at } ... ] }`（messages 按 `id ASC`）

#### `POST /api/support/tickets/:id/messages` — 使用者回覆
- 404 / 403（非作者）同上。
- 狀態為 `resolved` 或 `closed` → `409 {error:'工单已完结，无法回复'}`。
- `content` 非空 → `400`。
- 副作用：若當前 `waiting_user`，同步 `UPDATE support_tickets SET status='in_progress', updated_at=datetime('now')`。
- **201** `{ "message": {...}, "ticket": { "id": <id>, "status": <新状态> } }`

#### `GET /api/support/categories` — 分類靜態列表（公開，無需 auth）
- **200** `{ "categories": [ { "key":"deposit_withdrawal", "label":"充值/提现" }, { "key":"betting", "label":"投注/赔率" }, { "key":"account", "label":"账户/登录" }, { "key":"technical", "label":"技术问题" }, { "key":"other", "label":"其他" } ] }`

### 3.2 客服/管理端（`requireSupport`）

#### `GET /api/admin/support/tickets?status=&category=&userId=&page=&pageSize=` — 所有工單
- `status`/`category` 非法 → `400`；`userId` 非法正整數 → `400`。
- **200** `{ count, total, page, pageSize, "tickets": [ { ...ticket, "user_name": "alice" } ] }`（JOIN users 取 user_name）

#### `GET /api/admin/support/tickets/:id` — 任意工單詳情
- 404 同前。**200** `{ "ticket": { ...含 user_name }, "messages": [...] }`

#### `POST /api/admin/support/tickets/:id/messages` — 客服回覆
- 404；狀態 `resolved/closed` → `409 {error:'工单已完结，无法回复'}`；`content` 非空 → `400`。
- `author_role='agent'`、`author_user_id = 操作者 id`；若當前 `open` → 同步 `status='in_progress'`。
- **201** `{ "message": {...}, "ticket": { "id": <id>, "status": <新状态> } }`

#### `PATCH /api/admin/support/tickets/:id/status` — 改狀態
- 請求體：`{ "status": "in_progress" }`；非 5 值之一 → `400 {error:'invalid status'}`；404 同前。
- 流轉不在白名單 → `409 {error:'非法状态流转: <current> -> <target>'}`。
- 副作用：`target='closed'` 時寫 `closed_by`、`closed_at`；一律 `updated_at=datetime('now')`。
- **200** `{ "ticket": {...} }`

### 3.3 權限矩陣（驗收核心）

| 端點 | 匿名 | user(本人) | user(他人) | support | admin |
|---|---|---|---|---|---|
| POST /api/support/tickets | 401 | 201 | — | 201* | 201* |
| GET /api/support/tickets | 401 | 200(只自己) | 200(只自己) | 200(只自己) | 200(只自己) |
| GET /api/support/tickets/:id | 401 | 200 | 403 | 200 | 200 |
| POST /api/support/tickets/:id/messages | 401 | 201(未完结) | 403 | 201* | 201* |
| PATCH /api/admin/support/tickets/:id/status | 401 | 403 | 403 | 200 | 200 |
| GET /api/admin/support/tickets | 401 | 403 | 403 | 200 | 200 |

\* support/admin 走 `POST /api/admin/support/tickets/:id/messages`（角色為 agent）。

---

## 4. 前端

### 4.1 Admin 面板（`apps/web/src/App.tsx`）

沿用既有單頁 panel 風格（`<section className="card"><h2>…</h2>`，如 `📡 数据源管理`），在 `App()` 渲染末尾加 `<SupportPanel />`：

- 標題 `🎫 工单/客服`。
- 過濾列：`status` 下拉（全部/open/in_progress/waiting_user/resolved/closed）、`category` 下拉、使用者名輸入框（userId 過濾）、分頁控件。
- 列表 table：id、user_name、subject、category、priority、status badge、created_at、updated_at、操作（詳情）。
- 詳情視圖（點列展開/右側）：訊息串（區分 user/agent 氣泡）、回覆輸入框、狀態變更按鈕群（只渲染**合法下一狀態**，來自前端維護的轉移表）。
- 新增調用的 `api` client 函式（`packages/core/src/api.ts`）：
  - `listSupportTickets(params)`、`getSupportTicket(id)`、`createSupportTicket(data)`、`replySupportTicket(id, content)`（user 端用）；
  - `adminListTickets(params)`、`adminGetTicket(id)`、`adminReplyTicket(id, content)`、`adminSetTicketStatus(id, status)`、`listSupportCategories()`。

### 4.2 使用者端（`apps/mobile`，Expo Router）

- 入口：`apps/mobile/src/app/account.tsx` 的「👤 我的」區塊（約 line 689 起）加一張 Card `🎫 聯繫客服`，`router.push('/support')`；未登入時與既有入口一致提示先登入。
- 新頁面：`apps/mobile/src/app/support.tsx`（Expo Router route；在 `_layout.tsx` 加 `<Tabs.Screen name="support" options={{ href: null }} />` 使之非底部 tab、可被 push）。
  - 頁面內容：我的工單列表（`GET /api/support/tickets`）、新建工單表單（category 選擇 + subject + body + priority 選填）、詳情 + 回覆（`GET /api/support/tickets/:id` + `POST .../messages`）。
- 依賴 `@betting/core` 新增的 types/`api` 函式（跨 Web/Mobile 共用），API base 沿用 `_layout.tsx` 的 `setApiBase('http://100.66.5.26:4100/api')` 設定，無需改動。

---

## 5. 分階段 Plan

> 每個 Todo 給：**負責角色** + **具體可執行驗證**（curl / 測試命令 + 預期 HTTP/body/副作用）+ **預期結果**。
> curl 假設 API 在 `http://localhost:4100/api`；建 `alice` 測試帳號用 `POST /api/users`（返回 `token`）。
> 驗證 helper：`JQ="python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[\"token\"])'"`

### Step 1 — Schema + 遷移

**修改檔案**：`apps/api/src/db/schema.sql`（末尾追加 §2.1/§2.2 建表 + 索引）；`apps/api/src/db/index.ts` 的 `migrate()`（無需新增，`db.exec(schema.sql)` 已覆蓋；僅確認 `CREATE TABLE IF NOT EXISTS` 冪等）。

| # | 負責角色 | Todo（可執行驗證） | 預期結果 |
|---|---|---|---|
| 1.1 | 後端 | 在 schema.sql 追加 `support_tickets`/`support_messages` + 3 個索引，用 `CREATE TABLE IF NOT EXISTS`。驗證：`pnpm --filter api dev` 啟動無報錯後，`sqlite3`（或任何只讀查詢）確認：`PRAGMA table_info(support_tickets)` 返回 13 欄（id/user_id/category/subject/body/priority/status/closed_by/closed_at/created_at/updated_at）且含 `status CHECK`。 | 新表建立；重啟服務（migrate 重跑）不報錯、不重建。 |
| 1.2 | 後端 | 冪等性驗證：連續啟動 API 兩次（或呼叫 `migrate(db)` 兩次）。預期：無 `table already exists` 報錯；`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('support_tickets','support_messages')` = 2。 | migrate 冪等，重跑安全。 |
| 1.3 | 後端 | 手動建 `support` 角色帳號（示範用）：`INSERT INTO users(name,role) VALUES('agent01','support')` + 對應 `accounts` 行（或 `UPDATE users SET role='support' WHERE id=2`）。驗證：`curl -s -X POST http://localhost:4100/api/auth/login -d '{"name":"agent01","password":"123456"}'` 返回 200 且 `user.role=='support'`。 | `support` 角色可登入，可作客服帳號。 |

### Step 2 — 使用者端 API

**新增/修改檔案**：`apps/api/src/routes/support.ts`（user 路由）、`apps/api/src/index.ts`（`app.use('/api', supportRouter)`）、`apps/api/src/routes/middleware.ts`（新增 `requireSupport`，不刪改既有函式）。

| # | 負責角色 | Todo（可執行驗證） | 預期結果 |
|---|---|---|---|
| 2.1 | 後端 | 建單路由 `POST /api/support/tickets`。驗證：`TOKEN=$(curl -s -X POST http://localhost:4100/api/auth/login -d '{"name":"alice","password":"123456"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')` 後 `curl -s -X POST http://localhost:4100/api/support/tickets -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"category":"deposit_withdrawal","subject":"充值未到账","body":"我充了100块没到账","priority":"high"}'`。預期 **201**、`ticket.user_id==alice.id`、`ticket.status=="open"`、`ticket.priority=="high"`。 | 建單成功，作者/狀態/優先級正確。 |
| 2.2 | 後端 | 建單參數校驗。驗證：(a) 缺 `subject` → **400** `{error:'subject is required'}`；(b) `category:"hacking"` → **400** `{error:'invalid category'}`；(c) 匿名（無 Bearer）→ **401**。 | 400/401 邊界正確。 |
| 2.3 | 後端 | 我的工單列表 + 篩選 + 分頁 `GET /api/support/tickets?status=open&page=1&pageSize=5`。驗證：先建 3 張單（含 1 張改非 open 後），`curl -s "http://localhost:4100/api/support/tickets?page=1&pageSize=2"` → **200** `total==3`、`count==2`、`page==1`、`pageSize==2`；`?status=open` 只回 open。 | 分頁與狀態篩選正確。 |
| 2.4 | 後端 | 看單 + 訊息 `GET /api/support/tickets/:id`。驗證：`alice` 看自己單 → **200** 且 `messages` 為空陣列；`bob` 看 `alice` 的單 → **403**；不存在的 id → **404**。 | 只有作者/客服能看單。 |
| 2.5 | 後端 | 使用者回覆 `POST /api/support/tickets/:id/messages`。驗證：`alice` 對自己 open 單 `-d '{"content":"麻烦尽快处理"}'` → **201**、`message.author_role=="user"`、`ticket.status` 仍 `"open"`；再對 resolved/closed 單回 → **409**。 | 回覆入庫、狀態不變、已完結鎖定。 |
| 2.6 | 後端 | 分類列表 `GET /api/support/categories`。驗證：匿名 **200** 且 `categories.length==5` 且含 `deposit_withdrawal`。 | 公開靜態列表可用。 |

### Step 3 — 客服/管理端 API

**修改檔案**：`apps/api/src/routes/support.ts`（admin 路由）。

| # | 負責角色 | Todo（可執行驗證） | 預期結果 |
|---|---|---|---|
| 3.1 | 後端 | 全部工單列表 `GET /api/admin/support/tickets`。驗證：`ATOKEN=$(…login admin/admin123…)`，`curl -s http://localhost:4100/api/admin/support/tickets -H "Authorization: Bearer $ATOKEN"` → **200** 且 `tickets[].user_name` 存在、包含 alice 的單；普通 user token → **403**；匿名 → **401**。 | admin 可看全部、普通 user 403。 |
| 3.2 | 後端 | 客服回覆 `POST /api/admin/support/tickets/:id/messages`。驗證：`-d '{"content":"收到，正在核查充值记录"}'` → **201**、`author_role=="agent"`、`ticket.status` 由 `open` 變 **`in_progress`**；對 `closed` 單回 → **409**。 | 客服回覆入庫並自動 `open→in_progress`。 |
| 3.3 | 後端 | 改狀態 `PATCH /api/admin/support/tickets/:id/status`。驗證完整狀態流：`{"status":"in_progress"}` → 200；`{"status":"waiting_user"}` → 200；用 alice 回覆一次（自動 `waiting_user→in_progress`）；`{"status":"resolved"}` → 200；`{"status":"closed"}` → 200 且 **`closed_by` 非空、`closed_at` 非空**；對 closed 再 `{"status":"open"}` → **409** `{error:'非法状态流转: closed -> open'}`。 | 狀態流按白名單流轉，closed 終態。 |
| 3.4 | 後端 | 詳情 `GET /api/admin/support/tickets/:id`。驗證：→ **200** 且 `messages.length` 隨 Step 3.2 累積（>=1）、`ticket.user_name` 正確。 | 訊息累積與作者資訊正確。 |
| 3.5 | 後端 | 過濾參數校驗。驗證：`?status=bad` → **400**；`?userId=abc` → **400**。 | 非法過濾參數被拒。 |

### Step 4 — Admin Web 面板

**修改檔案**：`apps/web/src/App.tsx`（`<SupportPanel />`）、`packages/core/src/types.ts`（`SupportTicket`/`SupportMessage`）、`packages/core/src/api.ts`（§4.1 所列函式）。

| # | 負責角色 | Todo（可執行驗證） | 預期結果 |
|---|---|---|---|
| 4.1 | 前端 | core types + api 函式。驗證：`pnpm -w run build`（或各 package `tsc`）通過無類型錯誤。 | 型別與 client 層編譯通過。 |
| 4.2 | 前端 | `<SupportPanel />`：列表 + 過濾（status/category）+ 分頁。驗證：`pnpm --filter web dev` 啟動，admin 登入後在「🎫 工单/客服」區塊看到 Step 3 產生的工單；切換狀態下拉後列表即時刷新。 | 面板讀取 admin 列表 API 並渲染。 |
| 4.3 | 前端 | 詳情 + 客服回覆 + 改狀態按鈕。驗證：點擊工單 → 看到訊息串（user/agent 區分）；發送客服回覆 → 200 且訊息串 +1、狀態徽章變 `in_progress`；點「標記已解決」→ 徽章 `resolved`；點「關閉」→ `closed` 且回覆框禁用。 | UI 與 API 副作用一致。 |

### Step 5 — 使用者端入口（mobile）

**修改檔案**：`apps/mobile/src/app/account.tsx`（入口 Card）、`apps/mobile/src/app/support.tsx`（新頁面）、`apps/mobile/src/app/_layout.tsx`（註冊 hidden tab）。

| # | 負責角色 | Todo（可執行驗證） | 預期結果 |
|---|---|---|---|
| 5.1 | 前端 | 入口 + 頁面。驗證：`pnpm --filter mobile web` 啟動，alice 登入後「我的」頁出現「🎫 聯繫客服」，點擊進入 `/support`；能列出自己的工單、能新建工單（提交後列表 +1）、能點開單回覆（成功後訊息 +1）。 | 使用者可完整自助提單/回覆。 |
| 5.2 | 前端 | 未登入導流。驗證：登出狀態進 `support` 頁 → 顯示「請先登入」並可跳轉登入。 | 未登入體驗正確。 |

### Step 6 — E2E 驗證 + 部署

**新增檔案**：`scripts/verify_support.py`（仿 `scripts/verify_analytics.py`：urllib 呼叫 API + 斷言，可重複執行）。

| # | 負責角色 | Todo（可執行驗證） | 預期結果 |
|---|---|---|---|
| 6.1 | 測試 | 寫 `verify_support.py` 覆蓋完整驗收矩陣（下節 §驗收清單）。驗證：`python3 scripts/verify_support.py http://localhost:4100/api`。 | 全部斷言 PASS；重跑仍 PASS（冪等：可先刪測試工單或允許重複建單）。 |
| 6.2 | 部署 | 確認生態重啟無誤。驗證：`pm2 restart ecosystem.config.js`（或依既有流程）後，`curl -s http://localhost:4100/api/support/categories` → **200**。 | 生產流程正常、新表已就位。 |

### 驗收清單（Step 6.1 必須全覆蓋）

1. **權限**：匿名訪問所有受保護端點 → `401`；普通 user 訪問 `/api/admin/support/*` → `403`；普通 user 看他人單 → `403`；support/admin 全部 `200/201`。
2. **狀態流**：`open → in_progress → waiting_user → (user 回覆自動) in_progress → resolved → closed` 全程 `200`，且每次返回的 `ticket.status` 與提交一致。
3. **關閉後鎖定**：`closed` 後 user/agent 回覆均 `409`；再次 `PATCH` 狀態 `409`；`closed_by`/`closed_at` 已寫入。
4. **可見性**：只有作者本人與客服可看單（他人 `403`）。
5. **分頁**：建 N 張單，`pageSize=2` 時 `count==2`、`total==N`、翻頁無重複。
6. **資料正確性**：`messages.length` 隨回覆累積；`ticket.body` 保持首條內容不變；`user_id`/`author_role`/`created_at` 均正確。

---

## 6. 邊界與風險

- **不改既有模組**：只新增 `support.ts`、`SupportPanel`、core types/api 加法、`support` 頁面；既有路由/面板/邏輯一行不動。唯一加法式改動是 `middleware.ts` 新增 `requireSupport`（不改 `requireRole` 簽名，既有調用不受影響）。
- **SQLite 遷移冪等**：新表全用 `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`；`migrate()` 重跑安全；不涉及 ALTER（新表無需加列）。
- **users 帳號整合**：`support_tickets.user_id`、`support_messages.author_user_id`、`closed_by` 全部外鍵到既有 `users(id)`；作者一律取自 `res.locals.user.id`，不信任前端傳入。
- **級聯刪除**：SQLite 默認 `NO ACTION`，外鍵不設 `ON DELETE`（與 schema.sql 現有表一致）；本階段不提供刪工單 API，避免懸空引用。
- **XSS/注入**：一律 prepared statement + 純文字渲染（現有風格），不做富文本。
- **不做**：即時聊天、轉派/SLA、附件、reopen、通知、知識庫、以及任何滾球/支付/風控/Analytics 整合。
- **資料量**：工單查詢全部走 `user_id`/`status` 索引；列表分頁封頂 `pageSize=100`。
