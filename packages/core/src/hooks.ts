import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import type { Bet, Match, User, MatchesResponse, UsersResponse, BetsResponse } from './types.js';

/** 通用异步数据 hook：加载 + 刷新 + 错误 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, error, refresh: run };
}

// ---- 业务 hooks ----

export function useMatches() {
  return useAsync<MatchesResponse>(() => api.listMatches());
}

export function useUsers() {
  return useAsync<UsersResponse>(() => api.listUsers());
}

export function useBets(userId?: number) {
  return useAsync<BetsResponse>(() => api.listBets(userId), [userId]);
}

export interface CurrentUserState {
  user: User | null;
  select: (u: User) => void;
  clear: () => void;
}

/** 当前选中用户（demo 无鉴权，前端本地状态） */
export function useCurrentUser(): CurrentUserState {
  const [user, setUser] = useState<User | null>(null);
  const select = useCallback((u: User) => setUser(u), []);
  const clear = useCallback(() => setUser(null), []);
  return { user, select, clear };
}

export interface BetSlipItem {
  marketId: number;
  selection: string;
  price: number;
  label: string;
}

export interface BetSlipState {
  items: BetSlipItem[];
  add: (item: BetSlipItem) => void;
  remove: (marketId: number, selection: string) => void;
  clear: () => void;
  totalStake: number;
  potentialPayout: number;
}

/** 下注单（前端暂存，提交时才调 API） */
export function useBetSlip(): BetSlipState {
  const [items, setItems] = useState<BetSlipItem[]>([]);

  const add = useCallback((item: BetSlipItem) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.marketId === item.marketId && i.selection === item.selection);
      if (exists) return prev.filter((i) => i !== exists);
      return [...prev, item];
    });
  }, []);

  const remove = useCallback((marketId: number, selection: string) => {
    setItems((prev) => prev.filter((i) => !(i.marketId === marketId && i.selection === selection)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totalStake = items.reduce((sum, i) => sum + 100, 0);
  const potentialPayout = items.reduce((sum, i) => sum + 100 * i.price, 0);

  return { items, add, remove, clear, totalStake, potentialPayout };
}

export interface PlaceBetResult {
  bet: Bet;
  balance: number;
}

/** 提交下注单（逐单提交，扣余额） */
export async function placeBetItems(userId: number, items: BetSlipItem[]): Promise<PlaceBetResult[]> {
  const results: PlaceBetResult[] = [];
  for (const item of items) {
    const res = await api.placeBet(userId, item.marketId, item.selection, 100);
    results.push({ bet: res.bet, balance: res.account.balance });
  }
  return results;
}

export type { Match, User };
