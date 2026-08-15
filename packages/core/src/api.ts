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
  UserPreferences
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
  listMatches: () => request<MatchesResponse>('/matches'),
  createMatch: (homeTeam: string, awayTeam: string, kickoffTime: string) =>
    request<{ match: Match }>('/matches', {
      method: 'POST',
      body: JSON.stringify({ homeTeam, awayTeam, kickoffTime })
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
  createContent: (title: string, type: string, body: string) =>
    request<{ content: Content }>('/cms/contents', {
      method: 'POST',
      body: JSON.stringify({ title, type, body })
    }),
  listContents: (status?: 'published' | 'draft') =>
    request<ContentsResponse>(status ? `/cms/contents?status=${status}` : '/cms/contents'),
  publishContent: (id: number) =>
    request<{ content: Content }>(`/cms/contents/${id}/publish`, { method: 'POST' }),
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
    })
};

export type {
  Bet,
  Market,
  Match,
  OddsItem,
  SettleResponse,
  SettleSummaryItem,
  User
} from './types';
