import type {
  Bet,
  Market,
  Match,
  OddsItem,
  SettleResponse,
  SettleSummaryItem,
  User,
  MatchesResponse,
  UsersResponse,
  BetsResponse,
  Content,
  ContentsResponse,
  Promotion,
  PromotionsResponse,
  UserPreferences,
  VipTier,
  MyVip,
  RiskLimits,
  PaymentOrder,
  Withdrawal,
  WithdrawalsResponse,
  DashboardStats,
  TrendPoint,
  HotMatch,
  UserAnalytics,
  FeedStatus,
  SupportCategory,
  SupportMessage,
  SupportTicket,
  SupportTicketList,
  SportsResponse,
  LeaguesResponse
} from './types';

/**
 * API base URL 可配置：
 * - Web：默认 '/api'（走 vite proxy → :4100）
 * - Native（Expo）：启动时调用 setApiBase('http://<tailscale-ip>:4100/api')
 */
let API_BASE = '/api';

export function setApiBase(base: string) {
  API_BASE = base.replace(/\/$/, '');
}

export function getApiBase() {
  return API_BASE;
}

/** 当前登录用户的 session token（登录后由 setAuthToken 注入） */
let AUTH_TOKEN: string | null = null;

export function setAuthToken(token: string | null) {
  AUTH_TOKEN = token;
}

export function getAuthToken() {
  return AUTH_TOKEN;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export const api = {
  // auth
  login: (name: string, password: string) =>
    request<{ user: User; token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ name, password }) }),
  register: (name: string, password: string) =>
    request<{ user: User; token: string }>('/users', { method: 'POST', body: JSON.stringify({ name, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  // accounts
  createUser: (name: string, password?: string) =>
    request<{ user: User }>('/users', { method: 'POST', body: JSON.stringify({ name, password }) }),
  listUsers: () => request<UsersResponse>('/users'),
  getUser: (id: number) => request<{ user: User }>(`/users/${id}`),
  deposit: (id: number, amount: number) =>
    request<{ account: { id: number; balance: number }; transaction: { id: number; type: string; amount: number } }>(
      `/users/${id}/deposit`,
      { method: 'POST', body: JSON.stringify({ amount }) }
    ),
  // matches & markets
  listMatches: (params?: { sport?: string; league?: string; status?: string }) => {
    const qs: string[] = [];
    if (params?.sport) qs.push(`sport=${encodeURIComponent(params.sport)}`);
    if (params?.league) qs.push(`league=${encodeURIComponent(params.league)}`);
    if (params?.status) qs.push(`status=${encodeURIComponent(params.status)}`);
    return request<MatchesResponse>(`/matches${qs.length ? `?${qs.join('&')}` : ''}`);
  },
  // sports
  getSports: () => request<SportsResponse>('/sports'),
  getLeagues: (sport?: string) =>
    request<LeaguesResponse>(sport ? `/leagues?sport=${encodeURIComponent(sport)}` : '/leagues'),
  createMatch: (homeTeam: string, awayTeam: string, kickoffTime: string, sport?: string, league?: string) =>
    request<{ match: Match }>('/matches', {
      method: 'POST',
      body: JSON.stringify({ homeTeam, awayTeam, kickoffTime, sport, league })
    }),
  createMarket: (
    matchId: number,
    type: string,
    line: number | null,
    odds: Record<string, number>
  ) =>
    request<{ market: Market; odds: OddsItem[] }>(`/matches/${matchId}/markets`, {
      method: 'POST',
      body: JSON.stringify({ type, line, odds })
    }),
  // bets
  placeBet: (userId: number, marketId: number, selection: string, stake: number) =>
    request<{ bet: Bet; account: { balance: number } }>('/bets', {
      method: 'POST',
      body: JSON.stringify({ userId, marketId, selection, stake })
    }),
  listBets: (userId?: number) =>
    request<BetsResponse>(userId ? `/bets?userId=${userId}` : '/bets'),
  // settle
  recordResult: (matchId: number, homeScore: number, awayScore: number) =>
    request<{ match: Match }>(`/matches/${matchId}/result`, {
      method: 'POST',
      body: JSON.stringify({ homeScore, awayScore })
    }),
  settleMatch: (matchId: number) =>
    request<SettleResponse>(`/matches/${matchId}/settle`, { method: 'POST' }),
  // CMS
  createContent: (title: string, type: string, body: string, publish_at?: string | null) =>
    request<{ content: Content }>('/cms/contents', {
      method: 'POST',
      body: JSON.stringify({ title, type, body, publish_at })
    }),
  updateContent: (id: number, data: { title?: string; type?: string; body?: string; publish_at?: string | null }) =>
    request<{ content: Content }>(`/cms/contents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  listContents: (status?: 'published' | 'draft' | 'scheduled' | 'archived') =>
    request<ContentsResponse>(status ? `/cms/contents?status=${status}` : '/cms/contents'),
  publishContent: (id: number) =>
    request<{ content: Content }>(`/cms/contents/${id}/publish`, { method: 'POST' }),
  unpublishContent: (id: number) =>
    request<{ content: Content }>(`/cms/contents/${id}/unpublish`, { method: 'POST' }),
  archiveContent: (id: number) =>
    request<{ content: Content }>(`/cms/contents/${id}/archive`, { method: 'POST' }),
  restoreContent: (id: number) =>
    request<{ content: Content }>(`/cms/contents/${id}/restore`, { method: 'POST' }),
  // CRM
  createPromotion: (data: {
    title: string;
    description: string;
    bonus_type: string;
    bonus_value: number;
    min_deposit?: number;
  }) =>
    request<{ promotion: Promotion }>('/crm/promotions', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  listPromotions: (status?: 'active' | 'expired') =>
    request<PromotionsResponse>(status ? `/crm/promotions?status=${status}` : '/crm/promotions'),
  claimPromotion: (promotionId: number, userId: number) =>
    request<{ claimed: boolean; promotion: Promotion }>(`/crm/promotions/${promotionId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    }),
  checkClaim: (promotionId: number, userId: number) =>
    request<{ claimed: boolean }>(`/crm/promotions/${promotionId}/claims?userId=${userId}`),
  getPreferences: (userId: number) =>
    request<{ preferences: UserPreferences }>(`/users/${userId}/preferences`),
  updatePreferences: (userId: number, data: { favorite_team?: string | null; marketing_opt_in?: boolean }) =>
    request<{ preferences: UserPreferences }>(`/users/${userId}/preferences`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  // CRM VIP 等级
  listVipTiers: () => request<{ tiers: VipTier[] }>('/vip/tiers'),
  getMyVip: () => request<{ vip: MyVip }>('/vip/me'),
  // risk & trading (Step 21-24)
  getRiskLimits: () => request<{ limits: RiskLimits }>('/risk/limits'),
  updateRiskLimits: (data: Partial<Record<'min_stake' | 'max_stake' | 'min_odds' | 'max_odds' | 'max_daily_stake', number>>) =>
    request<{ limits: RiskLimits }>('/risk/limits', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  updateOdds: (marketId: number, odds: Record<string, number>) =>
    request<{ market: Market }>(`/markets/${marketId}/odds`, {
      method: 'PUT',
      body: JSON.stringify({ odds })
    }),
  suspendMarket: (marketId: number) =>
    request<{ market: Market }>(`/markets/${marketId}/suspend`, { method: 'POST' }),
  resumeMarket: (marketId: number) =>
    request<{ market: Market }>(`/markets/${marketId}/resume`, { method: 'POST' }),
  // payments (Step 27-30)
  createDepositOrder: (amount: number, provider: string = 'mock', currency: string = 'USD') =>
    request<{ order: PaymentOrder }>('/payments/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount, provider, currency })
    }),
  mockPay: (orderNo: string, status: 'paid' | 'failed' = 'paid') =>
    request<{ ok: boolean; order_no: string; status: string; balance?: number; idempotent?: boolean }>(
      '/payments/mock/pay',
      { method: 'POST', body: JSON.stringify({ order_no: orderNo, status }) }
    ),
  listPaymentOrders: (all = false) =>
    request<{ orders: PaymentOrder[] }>(all ? '/payments/orders?all=1' : '/payments/orders'),
  getPaymentOrder: (orderNo: string) =>
    request<{ order: PaymentOrder }>(`/payments/orders/${orderNo}`),
  listPaymentProviders: () =>
    request<{ providers: { name: string; configured: boolean }[] }>('/payments/providers'),
  // 提现 (PAM 资金闭环)
  createWithdrawal: (data: { amount: number; method?: string; account_info?: string }) =>
    request<{ withdrawal: Withdrawal }>('/withdrawals', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  listWithdrawals: (opts: { all?: boolean; status?: Withdrawal['status'] } = {}) => {
    const q: string[] = [];
    if (opts.all) q.push('all=1');
    if (opts.status) q.push(`status=${opts.status}`);
    return request<WithdrawalsResponse>(q.length ? `/withdrawals?${q.join('&')}` : '/withdrawals');
  },
  approveWithdrawal: (id: number) =>
    request<{ withdrawal: Withdrawal; account: { balance: number } }>(`/withdrawals/${id}/approve`, { method: 'POST' }),
  rejectWithdrawal: (id: number, reason?: string) =>
    request<{ withdrawal: Withdrawal }>(`/withdrawals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  markWithdrawalPaid: (id: number) =>
    request<{ withdrawal: Withdrawal }>(`/withdrawals/${id}/paid`, { method: 'POST' }),
  // analytics (Step 31-34)
  getAnalyticsDashboard: () => request<{ dashboard: DashboardStats }>('/analytics/dashboard'),
  getAnalyticsTrends: (days = 14) => request<{ trends: TrendPoint[] }>(`/analytics/trends?days=${days}`),
  getAnalyticsHotMatches: (limit = 10) => request<{ matches: HotMatch[] }>(`/analytics/hot-matches?limit=${limit}`),
  getAnalyticsUsers: (limit = 10) => request<{ users: UserAnalytics[] }>(`/analytics/users?limit=${limit}`),
  // feed 数据源管理 (P3)
  getFeedStatus: () => request<FeedStatus>('/admin/feed/status'),
  toggleFeedManual: (manual: boolean) =>
    request<{ manual: boolean }>('/admin/feed/toggle', {
      method: 'POST',
      body: JSON.stringify({ manual })
    }),
  // feed 自动派彩开关 (P4)
  setFeedAutoSettle: (auto: boolean) =>
    request<{ auto: boolean }>('/admin/feed/auto-settle', {
      method: 'POST',
      body: JSON.stringify({ auto })
    }),
  ingestFeedNow: () => request<{ ok: boolean; detail: unknown; scores?: { ok: boolean; detail: unknown } | null }>('/admin/feed/ingest', { method: 'POST' }),
  // customer support 工单 (Step 4-5)
  listSupportCategories: () =>
    request<{ categories: SupportCategory[] }>('/support/categories'),
  createSupportTicket: (data: { category: string; subject: string; body: string; priority?: string }) =>
    request<{ ticket: SupportTicket }>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listSupportTickets: (params?: { status?: string; category?: string; page?: number; pageSize?: number }) => {
    const qs: string[] = [];
    if (params?.status) qs.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.category) qs.push(`category=${encodeURIComponent(params.category)}`);
    if (params?.page) qs.push(`page=${params.page}`);
    if (params?.pageSize) qs.push(`pageSize=${params.pageSize}`);
    return request<SupportTicketList>(`/support/tickets${qs.length ? `?${qs.join('&')}` : ''}`);
  },
  getSupportTicket: (id: number) =>
    request<{ ticket: SupportTicket; messages: SupportMessage[] }>(`/support/tickets/${id}`),
  replySupportTicket: (id: number, content: string) =>
    request<{ message: SupportMessage; ticket: { id: number; status: string } }>(`/support/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  adminListTickets: (params?: { status?: string; category?: string; userId?: number; page?: number; pageSize?: number }) => {
    const qs: string[] = [];
    if (params?.status) qs.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.category) qs.push(`category=${encodeURIComponent(params.category)}`);
    if (params?.userId) qs.push(`userId=${params.userId}`);
    if (params?.page) qs.push(`page=${params.page}`);
    if (params?.pageSize) qs.push(`pageSize=${params.pageSize}`);
    return request<SupportTicketList>(`/admin/support/tickets${qs.length ? `?${qs.join('&')}` : ''}`);
  },
  adminGetTicket: (id: number) =>
    request<{ ticket: SupportTicket; messages: SupportMessage[] }>(`/admin/support/tickets/${id}`),
  adminReplyTicket: (id: number, content: string) =>
    request<{ message: SupportMessage; ticket: { id: number; status: string } }>(`/admin/support/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  adminSetTicketStatus: (id: number, status: string) =>
    request<{ ticket: SupportTicket }>(`/admin/support/tickets/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

export type {
  Bet,
  Market,
  Match,
  OddsItem,
  SettleResponse,
  SettleSummaryItem,
  User,
  SupportCategory,
  SupportMessage,
  SupportTicket,
  SupportTicketList
} from './types';
