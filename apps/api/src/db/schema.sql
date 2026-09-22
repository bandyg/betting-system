-- Betting System MVP schema (SQLite)
-- 7 tables: users, accounts, transactions, matches, markets, odds, bets

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  vip_tier TEXT NOT NULL DEFAULT 'bronze',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  balance REAL NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  type TEXT NOT NULL CHECK (type IN ('deposit', 'bet_stake', 'payout', 'void_refund', 'bonus')),
  amount REAL NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'finished', 'settled')),
  home_score INTEGER,
  away_score INTEGER,
  external_id TEXT,                 -- supplier match id (feed)
  source TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'the-odds-api' | ...
  sport TEXT,
  league TEXT,
  match_feed_key TEXT,              -- vendor 原始 sport key（/scores 端點反查用；upcoming 模式必填）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  type TEXT NOT NULL CHECK (type IN ('1x2', 'ah', 'ou')),
  line REAL,               -- handicap (ah) or total (ou); NULL for 1x2
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'suspended', 'settled')),
  external_id TEXT,                 -- deterministic compound `<match-ext>:<type>[:<line>]`
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS odds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  selection TEXT NOT NULL, -- home/draw/away (1x2), home/away (ah), over/under (ou)
  price REAL NOT NULL CHECK (price > 1),
  UNIQUE (market_id, selection)
);

CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  market_id INTEGER REFERENCES markets(id), -- 单注必填；串关为 NULL（legs 存 bet_legs）
  selection TEXT, -- 单注必填；串关为 NULL
  bet_type TEXT NOT NULL DEFAULT 'single' CHECK (bet_type IN ('single', 'parlay')),
  price REAL NOT NULL CHECK (price > 1), -- 单注=该注赔率；串关=各 leg 赔率连乘
  stake REAL NOT NULL CHECK (stake > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void')),
  potential_payout REAL NOT NULL,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 串关腿：每腿关联一个市场/选择；结算时逐腿判定，全腿结算完才整体派彩
CREATE TABLE IF NOT EXISTS bet_legs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id INTEGER NOT NULL REFERENCES bets(id),
  market_id INTEGER NOT NULL REFERENCES markets(id),
  selection TEXT NOT NULL,
  price REAL NOT NULL CHECK (price > 1),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void')),
  settled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_markets_match ON markets(match_id);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_market ON bets(market_id);
CREATE INDEX IF NOT EXISTS idx_bet_legs_bet ON bet_legs(bet_id);
CREATE INDEX IF NOT EXISTS idx_bet_legs_market ON bet_legs(market_id);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);

-- ============ CMS (Step 15) ============
CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('announcement', 'promotion', 'article')),
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  publish_at TEXT,                  -- 定时发布时间（scheduled 状态必填；到时自动转 published）
  archived_at TEXT,                 -- 归档时间（archived 状态）
  view_count INTEGER NOT NULL DEFAULT 0,  -- 阅读量（公开单条读取时自增）
  locale TEXT NOT NULL DEFAULT 'zh',      -- 内容语言（zh / en / ...）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ CRM (Step 16) ============
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  bonus_type TEXT NOT NULL CHECK (bonus_type IN ('deposit_bonus', 'free_bet')),
  bonus_value REAL NOT NULL DEFAULT 0,
  min_deposit REAL NOT NULL DEFAULT 0,
  max_claims_per_user INTEGER NOT NULL DEFAULT 1,
  wagering_multiplier REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  start_at TEXT,
  end_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  favorite_team TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promotion_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL REFERENCES promotions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  bonus_amount REAL NOT NULL DEFAULT 0,
  wagering_required REAL NOT NULL DEFAULT 0,
  wagering_done REAL NOT NULL DEFAULT 0,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ Risk Limits (Step 21) ============
-- 单行配置表（id 恒为 1）：下注金额上/下限、赔率合法范围、用户日累计 stake 上限
CREATE TABLE IF NOT EXISTS risk_limits (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  min_stake REAL NOT NULL DEFAULT 1,
  max_stake REAL NOT NULL DEFAULT 100000,
  min_odds REAL NOT NULL DEFAULT 1.01,
  max_odds REAL NOT NULL DEFAULT 1000,
  max_daily_stake REAL NOT NULL DEFAULT 500000,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 支付通道：充值订单（PAM 支付通道模块）
CREATE TABLE IF NOT EXISTS payment_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL CHECK (provider IN ('mock', 'nowpayments')),
  amount REAL NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  provider_order_id TEXT,
  pay_url TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);

-- 提现（PAM 资金闭环：申请 → 审批 → 打款 → 流水）
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wd_no TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'bank'
    CHECK (method IN ('bank', 'crypto', 'usdt')),
  account_info TEXT NOT NULL DEFAULT '',        -- 收款账户信息（卡号/钱包地址）
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  reviewed_by INTEGER REFERENCES users(id),     -- 审批人（admin）
  reviewed_at TEXT,
  reject_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- feed 拉取可观测性日志（外部 Sportsbook 数据源接入，P1）
CREATE TABLE IF NOT EXISTS feed_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT,
  matches_seen INTEGER,
  matches_upserted INTEGER,
  errors TEXT
);

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

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id),
  author_user_id INTEGER NOT NULL REFERENCES users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('user', 'agent')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id);

-- ============ CRM VIP 等級（忠誠度計劃） ============
CREATE TABLE IF NOT EXISTS vip_tiers (
  tier TEXT PRIMARY KEY,
  min_lifetime_stake REAL NOT NULL DEFAULT 0,  -- 累計投注額門檻（不含退款）
  max_lifetime_stake REAL,                    -- 下一等級門檻（最高級為 NULL）
  cashback_rate REAL NOT NULL DEFAULT 0,      -- 每週現金返水比例
  fee_discount REAL NOT NULL DEFAULT 0,       -- 提現手續費折扣 0~1
  badge TEXT NOT NULL DEFAULT '',              -- 徽章 emoji
  perks TEXT NOT NULL DEFAULT '',              -- 權益說明
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO vip_tiers (tier, min_lifetime_stake, max_lifetime_stake, cashback_rate, fee_discount, badge, perks) VALUES
  ('bronze',  0,     5000,   0.00, 0.00, '🥉', 'VIP 等級 1：新人起步，享有基礎服務'),
  ('silver',  5000, 50000,  0.01, 0.05, '🥈', 'VIP 等級 2：1% 每周現金返水，5% 提現費折扣'),
  ('gold',    50000, 200000, 0.02, 0.10, '🥇', 'VIP 等級 3：2% 每周現金返水，10% 提現費折扣，專屬客服通道'),
  ('platinum', 200000, 500000, 0.03, 0.20, '💎', 'VIP 等級 4：3% 每周現金返水，20% 提現費折扣，專屬客戶經理'),
  ('diamond',  500000, NULL,   0.05, 0.30, '👑', 'VIP 等級 5：5% 每周現金返水，30% 提現費折扣，全部優先通道');
