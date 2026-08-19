export interface User {
  id: number;
  name: string;
  account_id: number;
  balance: number;
  role?: 'user' | 'admin';
}

export interface OddsItem {
  selection: string;
  price: number;
}

export interface Market {
  id: number;
  match_id: number;
  type: '1x2' | 'ah' | 'ou';
  line: number | null;
  status: string;
  odds: OddsItem[];
}

export interface Match {
  id: number;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  markets: Market[];
}

export interface Bet {
  id: number;
  user_id: number;
  market_id: number;
  selection: string;
  stake: number;
  price: number;
  potential_payout: number;
  status: string;
  created_at: string;
}

export interface MatchesResponse {
  count: number;
  matches: Match[];
}

export interface UsersResponse {
  users: User[];
}

export interface BetsResponse {
  count: number;
  bets: Bet[];
}

export interface SettleSummaryItem {
  marketId: number;
  type: string;
  line: number | null;
  openBets: number;
  won: number;
  lost: number;
  void: number;
  payoutAmount: number;
  refundAmount: number;
}

export interface SettleResponse {
  match: Match;
  summary: SettleSummaryItem[];
  totalPayout: number;
  totalRefund: number;
}

/* ---- CMS (Step 15) ---- */
export interface Content {
  id: number;
  title: string;
  type: 'announcement' | 'promotion' | 'article';
  body: string;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
}

export interface ContentsResponse {
  count: number;
  contents: Content[];
}

/* ---- CRM (Step 16) ---- */
export interface Promotion {
  id: number;
  title: string;
  description: string;
  bonus_type: 'deposit_bonus' | 'free_bet';
  bonus_value: number;
  min_deposit: number;
  status: 'active' | 'expired';
  start_at: string | null;
  end_at: string | null;
  created_at: string;
}

export interface PromotionsResponse {
  count: number;
  promotions: Promotion[];
}

export interface UserPreferences {
  favorite_team: string | null;
  marketing_opt_in: boolean;
}

/* ---- Risk & Trading (Step 21-24) ---- */
export interface RiskLimits {
  id: number;
  min_stake: number;
  max_stake: number;
  min_odds: number;
  max_odds: number;
  max_daily_stake: number;
  updated_at: string;
}

export const RISK_FIELDS = ['min_stake', 'max_stake', 'min_odds', 'max_odds', 'max_daily_stake'] as const;
export type RiskField = (typeof RISK_FIELDS)[number];

export const RISK_FIELD_LABELS: Record<RiskField, string> = {
  min_stake: '单笔下限 ¥',
  max_stake: '单笔上限 ¥',
  min_odds: '最低赔率',
  max_odds: '最高赔率',
  max_daily_stake: '日累计上限 ¥',
};

export const MARKET_STATUS_LABELS: Record<string, string> = {
  open: '开放',
  suspended: '已挂盘',
  settled: '已结算',
};


export const TYPE_LABELS: Record<string, string> = {
  '1x2': '胜平负',
  ah: '让球',
  ou: '大小'
};

export const SEL_LABELS: Record<string, string> = {
  home: '主胜',
  draw: '平局',
  away: '客胜',
  over: '大球',
  under: '小球'
};

export const MATCH_STATUS_LABELS: Record<string, string> = {
  scheduled: '未开始',
  finished: '已结束',
  settled: '已结算'
};

// ── 支付通道 (PAM) ──
export type PaymentOrderStatus = 'pending' | 'paid' | 'failed' | 'expired';

export interface PaymentOrder {
  id: number;
  order_no: string;
  user_id: number;
  provider: string;
  amount: number;
  currency: string;
  status: PaymentOrderStatus;
  provider_order_id: string | null;
  pay_url: string | null;
  paid_at: string | null;
  created_at: string;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentOrderStatus, string> = {
  pending: '待支付',
  paid: '已支付',
  failed: '支付失败',
  expired: '已过期',
};

// ── Data Analytics (Step 31-34) ──
export interface DashboardStats {
  totalBetStake: number; // 总投注额
  totalBets: number; // 总下注数
  totalPayout: number; // 总派彩
  netRevenue: number; // 净收入 = 总投注 - 总派彩
  activeUsers: number; // 活跃用户（有下注）
  totalUsers: number; // 总用户数
  totalDeposits: number; // 总充值额
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  stake: number; // 当日下注额
  bets: number; // 当日下注数
  payout: number; // 当日派彩额
}

export interface HotMatch {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  stake: number; // 投注额
  bets: number; // 下注数
}

export interface UserAnalytics {
  userId: number;
  name: string;
  stake: number; // 累计投注额
  payout: number; // 累计派彩
  net: number; // 盈亏 = payout - stake
  bets: number; // 下注数
  deposits: number; // 累计充值
}

// ── Customer Support 工单 (Step 4-5) ──
export type SupportStatus = 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportCategoryKey = 'deposit_withdrawal' | 'betting' | 'account' | 'technical' | 'other';

export interface SupportCategory {
  key: SupportCategoryKey;
  label: string;
}

export interface SupportTicket {
  id: number;
  user_id: number;
  category: SupportCategoryKey;
  subject: string;
  body: string;
  priority: SupportPriority;
  status: SupportStatus;
  closed_by: number | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
}

export interface SupportMessage {
  id: number;
  ticket_id: number;
  author_user_id: number;
  author_role: 'user' | 'agent';
  content: string;
  created_at: string;
}

export interface SupportTicketList {
  count: number;
  total: number;
  page: number;
  pageSize: number;
  tickets: SupportTicket[];
}

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: '待处理',
  in_progress: '处理中',
  waiting_user: '等待用户',
  resolved: '已解决',
  closed: '已关闭',
};

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急',
};

/** 工单状态合法流转白名单（与后端 support.ts STATUS_TRANSITIONS 一致） */
export const SUPPORT_STATUS_TRANSITIONS: Record<SupportStatus, SupportStatus[]> = {
  open: ['in_progress', 'waiting_user', 'resolved', 'closed'],
  in_progress: ['waiting_user', 'resolved', 'closed'],
  waiting_user: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
};

// ── Feed 数据源管理 (P3) ──
export type FeedHealth = 'ok' | 'error' | 'disabled';

export interface FeedLogEntry {
  id: number;
  provider: string | null;
  requested_at: string;
  status: string | null;
  matches_seen: number | null;
  matches_upserted: number | null;
  errors: string | null;
}

export interface FeedStatus {
  manual: boolean;
  autoSettle: boolean;
  lastSync: string | null;
  lastProvider: string | null;
  health: FeedHealth;
  lastError: string | null;
  feedMatchCount: number;
  feedLog: FeedLogEntry[];
}
