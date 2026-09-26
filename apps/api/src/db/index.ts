import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', '..', 'data');
// Optional DB path override (used by isolated e2e/tests to avoid touching live data)
const DB_FILE = process.env.BETTING_DB_PATH ?? join(DATA_DIR, 'betting.db');

/**
 * 密码哈希：bcrypt（N 轮生产化第一阶，bcryptjs v3 默认 $2b$ 前缀，cost 10）。
 * 旧数据（SHA-256 无盐 hex）不做批量迁移 —— 保留原样，登录成功时惰性升级（见 auth.ts）。
 */
export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}

/** 是否为 bcrypt 哈希（$2a$/$2b$/$2y$ 前缀） */
export function isBcryptHash(h: string): boolean {
  return typeof h === 'string' && h.startsWith('$2');
}

/** 校验密码：bcrypt 哈希走 compareSync；历史 SHA-256 hex 走旧算法（登录成功后升级） */
export function verifyPassword(pw: string, stored: string): boolean {
  if (isBcryptHash(stored)) {
    try {
      return bcrypt.compareSync(pw, stored);
    } catch {
      return false;
    }
  }
  return createHash('sha256').update(pw).digest('hex') === stored;
}

/** 默认密码（旧用户无密码，迁移时统一回填 123456，demo 用） */
export const DEFAULT_PASSWORD = '123456';

export function getDb(): Database.Database {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  const db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: Database.Database): void {
  // Resolve schema.sql in both dev (tsx: src/db/schema.sql) and build (dist/db -> src/db/schema.sql)
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
  ];
  const found = candidates.find((p) => {
    try {
      readFileSync(p);
      return true;
    } catch {
      return false;
    }
  });
  if (!found) throw new Error(`schema.sql not found (tried: ${candidates.join(', ')})`);
  db.exec(readFileSync(found, 'utf8'));

  // 迁移：旧库 users 表无 password 列 → ALTER + 回填默认密码 hash
  const cols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'password')) {
    db.exec("ALTER TABLE users ADD COLUMN password TEXT NOT NULL DEFAULT ''");
  }
  const empty = db.prepare("SELECT COUNT(*) AS n FROM users WHERE password = ''").get() as { n: number };
  if (empty.n > 0) {
    db.prepare("UPDATE users SET password = ? WHERE password = ''").run(hashPassword(DEFAULT_PASSWORD));
  }

  // 迁移：role 列（默认 user）
  const cols2 = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!cols2.some((c) => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }

  // 迁移：markets.status CHECK 加 'suspended'（SQLite 不能改 CHECK，需重建表）
  // 注意：不能 ALTER TABLE markets RENAME TO markets_old —— 即使 foreign_keys=OFF，
  //   RENAME 仍会把 odds/bets 的外键引用改写为指向 markets_old，drop 后留下悬空引用。
  //   正确顺序：CREATE 新表 → COPY → DROP 旧表 → RENAME 新表为原名（被引用表从未改名）。
  const marketsSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='markets'")
    .get() as { sql: string } | undefined;
  if (marketsSql && !marketsSql.sql.includes('suspended')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE markets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL REFERENCES matches(id),
        type TEXT NOT NULL CHECK (type IN ('1x2', 'ah', 'ou')),
        line REAL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'suspended', 'settled')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO markets_new (id, match_id, type, line, status, created_at)
        SELECT id, match_id, type, line, status, created_at FROM markets;
      DROP TABLE markets;
      ALTER TABLE markets_new RENAME TO markets;
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_markets_match ON markets(match_id)');
    db.pragma('foreign_keys = ON');
  }

  // 迁移：markets.status CHECK 加 'closed'（滚球关盘自动切换，SPORTBOOK Step 36；方法同 suspended）
  const marketsSql2 = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='markets'")
    .get() as { sql: string } | undefined;
  if (marketsSql2 && !marketsSql2.sql.includes('closed')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE markets_new2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL REFERENCES matches(id),
        type TEXT NOT NULL CHECK (type IN ('1x2', 'ah', 'ou')),
        line REAL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'suspended', 'settled', 'closed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO markets_new2 (id, match_id, type, line, status, created_at)
        SELECT id, match_id, type, line, status, created_at FROM markets;
      DROP TABLE markets;
      ALTER TABLE markets_new2 RENAME TO markets;
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_markets_match ON markets(match_id)');
    db.pragma('foreign_keys = ON');
  }

  // 迁移：默认风控限额单行（id=1）
  const rl = db.prepare('SELECT id FROM risk_limits WHERE id = 1').get();
  if (!rl) {
    db.prepare(
      `INSERT INTO risk_limits (id, min_stake, max_stake, min_odds, max_odds, max_daily_stake)
       VALUES (1, 1, 100000, 1.01, 1000, 500000)`,
    ).run();
  }

  // 迁移：contents.status CHECK 扩展 'scheduled'/'archived'（SQLite 不能改 CHECK，需重建表；方法同 markets）
  const contentsSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='contents'")
    .get() as { sql: string } | undefined;
  if (contentsSql && !contentsSql.sql.includes('archived')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE contents_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('announcement', 'promotion', 'article')),
        body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
        publish_at TEXT,
        archived_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO contents_new (id, title, type, body, status, created_at, updated_at)
        SELECT id, title, type, body, status, created_at, updated_at FROM contents;
      DROP TABLE contents;
      ALTER TABLE contents_new RENAME TO contents;
    `);
    db.pragma('foreign_keys = ON');
  }

  // 默认 admin 账号（admin / admin123），不存在则创建
  const admin = db.prepare("SELECT id FROM users WHERE name = 'admin'").get() as { id: number } | undefined;
  if (!admin) {
    const info = db
      .prepare("INSERT INTO users (name, password, role) VALUES (?, ?, 'admin')")
      .run('admin', hashPassword('admin123'));
    db.prepare('INSERT INTO accounts (user_id) VALUES (?)').run(Number(info.lastInsertRowid));
  } else {
    // 已存在则确保角色是 admin
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);
  }

  // 迁移（P1 feed 接入）：matches / markets 加供应商溯源字段 + feed_log 表（幂等）
  const addCol = (table: string, name: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
addCol('matches', 'external_id', "external_id TEXT");
  addCol('matches', 'source', "source TEXT NOT NULL DEFAULT 'manual'");
  addCol('matches', 'sport', "sport TEXT");
  addCol('matches', 'league', "league TEXT");
  addCol('matches', 'match_feed_key', "match_feed_key TEXT");
  addCol('markets', 'external_id', "external_id TEXT");
  addCol('markets', 'source', "source TEXT NOT NULL DEFAULT 'manual'");
  addCol('contents', 'view_count', "view_count INTEGER NOT NULL DEFAULT 0");
  addCol('contents', 'locale', "locale TEXT NOT NULL DEFAULT 'zh'");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_matches_ext ON matches(external_id) WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_markets_ext ON markets(external_id) WHERE external_id IS NOT NULL;
    -- feed-scores-fix: scores 輪詢反查 index（僅未結算場次，覆蓋面小）。
    -- 放在 addCol 之後（schema.sql 不得對舊庫尚未存在的欄位建 index —— migrate 順序坑）。
    CREATE INDEX IF NOT EXISTS idx_matches_feed_key ON matches(match_feed_key)
      WHERE match_feed_key IS NOT NULL AND status IN ('scheduled','finished');
    CREATE TABLE IF NOT EXISTS feed_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT,
      matches_seen INTEGER,
      matches_upserted INTEGER,
      errors TEXT
    );
  `);

  // 迁移（P3）：settings 键值表 + feed_manual 默认值（手动开盘模式，admin 面板可切换，无需重启）
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('feed_manual', 'true')`).run();
  // 迁移（P4）：feed_auto_settle 默认开启 — 完场比分入库后自动派彩（settleMatch 幂等，可安全重复执行）
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('feed_auto_settle', 'true')`).run();
  // 迁移（CRM VIP）：users 表加 vip_tier 栏位（旧库无此列时补齐，幂等）
  addCol('users', 'vip_tier', "vip_tier TEXT NOT NULL DEFAULT 'bronze'");

  // 迁移（SPORTBOOK 串关）：bets 表加 bet_type + market_id/selection 可空（SQLite 不能改 NOT NULL，需重建表；方法同 markets）
  const betsSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bets'")
    .get() as { sql: string } | undefined;
  if (betsSql && !betsSql.sql.includes('bet_type')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE bets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        market_id INTEGER REFERENCES markets(id),
        selection TEXT,
        bet_type TEXT NOT NULL DEFAULT 'single' CHECK (bet_type IN ('single', 'parlay')),
        price REAL NOT NULL CHECK (price > 1),
        stake REAL NOT NULL CHECK (stake > 0),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'void')),
        potential_payout REAL NOT NULL,
        settled_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO bets_new (id, user_id, market_id, selection, bet_type, price, stake, status, potential_payout, settled_at, created_at)
        SELECT id, user_id, market_id, selection, 'single', price, stake, status, potential_payout, settled_at, created_at FROM bets;
      DROP TABLE bets;
      ALTER TABLE bets_new RENAME TO bets;
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_bets_market ON bets(market_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_bet_legs_bet ON bet_legs(bet_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_bet_legs_market ON bet_legs(market_id)');
    db.pragma('foreign_keys = ON');
  }

  // 迁移（CRM 促销风控）：promotions 加 max_claims_per_user / wagering_multiplier
  addCol('promotions', 'max_claims_per_user', 'max_claims_per_user INTEGER NOT NULL DEFAULT 1');
  addCol('promotions', 'wagering_multiplier', 'wagering_multiplier REAL NOT NULL DEFAULT 0');
  addCol('accounts', 'bonus_balance', 'bonus_balance REAL NOT NULL DEFAULT 0');

  // 迁移（CRM 促销风控）：transactions.type CHECK 加 'bonus'（SQLite 不能改 CHECK，需重建表）
  const txSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'")
    .get() as { sql: string } | undefined;
  if (txSql && !txSql.sql.includes("'bonus'")) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        type TEXT NOT NULL CHECK (type IN ('deposit', 'bet_stake', 'payout', 'void_refund', 'bonus')),
        amount REAL NOT NULL,
        ref_type TEXT,
        ref_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO transactions_new (id, account_id, type, amount, ref_type, ref_id, created_at)
        SELECT id, account_id, type, amount, ref_type, ref_id, created_at FROM transactions;
      DROP TABLE transactions;
      ALTER TABLE transactions_new RENAME TO transactions;
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)');
    db.pragma('foreign_keys = ON');
  }

  // 迁移（CRM 促销风控）：promotion_claims 重建 — 去掉 UNIQUE(promotion_id,user_id)，加审核/流水字段
  const claimsSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='promotion_claims'")
    .get() as { sql: string } | undefined;
  if (claimsSql && !claimsSql.sql.includes('bonus_amount')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE promotion_claims_new (
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
      INSERT INTO promotion_claims_new (id, promotion_id, user_id, status, bonus_amount, wagering_required, wagering_done, approved_at, created_at)
        SELECT id, promotion_id, user_id, 'approved', 0, 0, 0, NULL, created_at FROM promotion_claims;
      DROP TABLE promotion_claims;
      ALTER TABLE promotion_claims_new RENAME TO promotion_claims;
    `);
    db.pragma('foreign_keys = ON');
  }

  // 迁移（N 轮生产化第一阶）：JWT 签名密钥（首次启动随机生成并持久化，幂等）
  const jwtSecret = db
    .prepare("SELECT value FROM settings WHERE key = 'jwt_secret'")
    .get() as { value: string } | undefined;
  if (!jwtSecret) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)").run(
      randomBytes(32).toString('hex'),
    );
  }

  // 迁移（N 轮生产化第一阶）：sessions 表加 expires_at（JWT 会话过期时间，幂等）
  addCol('sessions', 'expires_at', 'expires_at TEXT');

  // 迁移（R6 客服知识库）：kb_categories + kb_articles 表（idempotent CREATE IF NOT EXISTS）
  //   搜索走 LIKE 全文模糊匹配 + status='published' 过滤；可后续升级 FTS5 虚拟表
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,           -- URL 友好标识（e.g. 'deposit', 'bet-rule', 'account'）
      title TEXT NOT NULL,                  -- 分类显示名
      sort_order INTEGER NOT NULL DEFAULT 0,  -- admin 可调
      icon TEXT NOT NULL DEFAULT '',        -- emoji 或图标类
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kb_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES kb_categories(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,            -- URL 友好标识（e.g. 'how-to-deposit'）
      title TEXT NOT NULL,
      body TEXT NOT NULL,                   -- Markdown
      tags TEXT NOT NULL DEFAULT '',         -- 逗号分隔关键词（搜索辅助）
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      view_count INTEGER NOT NULL DEFAULT 0,
      helpful_yes INTEGER NOT NULL DEFAULT 0,   -- 「这个有帮助」投票
      helpful_no INTEGER NOT NULL DEFAULT 0,
      author_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles(category_id);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_status ON kb_articles(status);
  `);
  // seed 默认分类（首次启动幂等 INSERT OR IGNORE）+ 5 篇示例 FAQ
  const seedCategories = [
    { slug: 'deposit',   title: '充值与支付',   icon: '💳', order: 1 },
    { slug: 'withdraw',  title: '提现相关',     icon: '🏦', order: 2 },
    { slug: 'bet-rule',  title: '投注规则',     icon: '🎯', order: 3 },
    { slug: 'account',   title: '账户与安全',   icon: '🔐', order: 4 },
    { slug: 'promotion', title: '优惠与活动',   icon: '🎁', order: 5 },
  ];
  const insCat = db.prepare(
    'INSERT OR IGNORE INTO kb_categories (slug, title, icon, sort_order) VALUES (?, ?, ?, ?)'
  );
  for (const c of seedCategories) insCat.run(c.slug, c.title, c.icon, c.order);

  const seedArticles = [
    {
      cat_slug: 'deposit', slug: 'how-to-deposit',
      title: '如何充值？支持哪些支付方式？',
      body: '## 充值流程\n\n1. 进入 **我的账户** → **充值**\n2. 选择金额（最低 10 元 / 最高 50,000 元 / 单笔）\n3. 选择支付方式：银行卡 / USDT / 支付宝\n4. 完成支付后系统自动入账（通常 30 秒内）\n\n## 支付方式说明\n\n- **银行卡**：Visa / MasterCard / JCB\n- **USDT**：TRC20 网络，请确认地址正确\n- **支付宝**：扫码支付，订单 5 分钟有效\n\n如有疑问可联系右下角在线客服。',
      tags: '充值,支付,银行卡,USDT,支付宝',
    },
    {
      cat_slug: 'withdraw', slug: 'withdraw-time',
      title: '提现需要多久到账？',
      body: '## 提现时效\n\n- **银行卡**：1–3 个工作日\n- **USDT**：30 分钟内（24x7 受理）\n- **支付宝**：2 小时内\n\n## 最低提现金额\n\n单笔最低 10 元，最高 50,000 元；日累计 100,000 元。\n\n## 为什么提现被拒？\n\n常见原因：账户余额不足 / 风控限额触发 / 银行卡信息错误。具体可在 **提现记录** 查看拒绝原因。',
      tags: '提现,到账时间,银行卡,USDT',
    },
    {
      cat_slug: 'bet-rule', slug: 'void-rule',
      title: '比赛取消/平盘后注单如何处理？',
      body: '## 平盘（Void）规则\n\n让球盘（亚盘）比赛结果**正好命中盘口**时，整张注单按 **退款（void）** 处理：\n\n- 单注：退还本金 stake，无盈利\n- 串关：仅该腿 void，整单继续结算其余腿\n\n## 比赛取消\n\n若赛事在开赛前取消或全场无效：\n- 该赛事的**所有市场** void\n- 已下注单全数退款\n- 串关中只要有任一腿赛事取消，整单 void 退款\n\n参考 [结算规则说明](https://example.com/rules)。',
      tags: '平盘,退款,void,串关,比赛取消',
    },
    {
      cat_slug: 'account', slug: 'forgot-password',
      title: '忘记密码怎么办？',
      body: '## 密码找回\n\n1. 登录页点击 **忘记密码**\n2. 输入注册用户名 / 邮箱\n3. 系统发送重置链接（5 分钟有效）\n4. 设置新密码（至少 6 位）\n\n## 仍然无法登录？\n\n- 确认用户名拼写（小写敏感）\n- 检查浏览器是否禁用了 cookie\n- 连续 5 次密码错误会触发 15 分钟登录冷却\n\n如需人工协助，请联系在线客服并提供：注册时间 / 最近登录时间 / 充值记录。',
      tags: '密码,找回,登录,账户',
    },
    {
      cat_slug: 'promotion', slug: 'wagering-requirement',
      title: '优惠的流水要求怎么算？',
      body: '## 流水要求（wagering requirement）\n\n领取优惠后需在规定时间内完成对应倍数的投注流水方可提现。\n\n## 示例\n\n- 奖金 100 元，流水要求 5 倍 → 累计投注 500 元可提现\n- 单注最低赔率 1.50 才计入流水\n- 串关各腿赔率 ≥ 1.50 也计入\n- **退款（void）和对冲注单不计入流水**\n\n## 进度查询\n\n**我的优惠** → 选择已领取优惠 → 查看「流水进度 X / Y」。',
      tags: '流水,wagering,优惠,提现',
    },
  ];
  const insArt = db.prepare(
    'INSERT OR IGNORE INTO kb_articles (category_id, slug, title, body, tags, status, author_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const a of seedArticles) {
    const catRow = db.prepare('SELECT id FROM kb_categories WHERE slug = ?').get(a.cat_slug) as { id: number } | undefined;
    if (catRow) {
      insArt.run(catRow.id, a.slug, a.title, a.body, a.tags, 'published', null);
    }
  }
}

// Ensure schema exists on import (idempotent)
const db = getDb();
migrate(db);

export default db;
