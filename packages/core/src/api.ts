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
  BetsResponse
} from './types.js';

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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
  // accounts
  createUser: (name: string) =>
    request<{ user: User }>('/users', { method: 'POST', body: JSON.stringify({ name }) }),
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
    request<SettleResponse>(`/matches/${matchId}/settle`, { method: 'POST' })
};

export type {
  Bet,
  Market,
  Match,
  OddsItem,
  SettleResponse,
  SettleSummaryItem,
  User
} from './types.js';
