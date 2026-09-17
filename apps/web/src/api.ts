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
import { BusinessError, ServerError, NetworkError, classifyHttpError } from './errors.js';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  } catch (e) {
    // 网络层错误：fetch failed / CORS / timeout / DNS
    const cause = e instanceof Error ? e.message : String(e);
    throw new NetworkError('网络连接失败，请检查后重试', cause);
  }

  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    /* 响应非 JSON（如空 body / HTML 错误页）— 留空对象 */
  }
  if (!res.ok) {
    const obj = body as { error?: string; code?: string; details?: unknown } | null;
    const msg = obj?.error ?? `HTTP ${res.status}`;
    throw classifyHttpError(res.status, msg, obj?.code, obj?.details);
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
