-- Betting System MVP schema (SQLite)
-- 7 tables: users, accounts, transactions, matches, markets, odds, bets

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
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
  type TEXT NOT NULL CHECK (type IN ('deposit', 'bet_stake', 'payout', 'void_refund')),
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
  market_id INTEGER NOT NULL REFERENCES markets(id),
  selection TEXT NOT NULL,
  price REAL NOT NULL CHECK (price > 1),
  stake REAL NOT NULL CHECK (stake > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void')),
  potential_payout REAL NOT NULL,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_markets_match ON markets(match_id);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_market ON bets(market_id);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);

-- ============ CMS (Step 15) ============
CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('announcement', 'promotion', 'article')),
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (promotion_id, user_id)
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
