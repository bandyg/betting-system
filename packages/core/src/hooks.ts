import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Bet, Match, User, MatchesResponse, UsersResponse, BetsResponse } from './types';

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
  update: (u: User) => void;
  clear: () => void;
}

/**
 * 当前选中用户（demo 无鉴权，前端本地状态）
 * 模块级单例 store —— 跨页面共享（赛事页选用户，下注页提交，我的页显示）
 */
let currentUser: User | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function useCurrentUser(): CurrentUserState {
  const [user, setUser] = useState<User | null>(currentUser);

  useEffect(() => {
    const listener = () => setUser(currentUser);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const select = useCallback((u: User) => {
    currentUser = u;
    emit();
  }, []);

  const update = useCallback((u: User) => {
    currentUser = u;
    emit();
  }, []);

  const clear = useCallback(() => {
    currentUser = null;
    emit();
  }, []);

  return { user, select, update, clear };
}

export interface BetSlipItem {
  marketId: number;
  selection: string;
  price: number;
  label: string;
  stake: number;
}

export interface BetSlipState {
  items: BetSlipItem[];
  add: (item: Omit<BetSlipItem, 'stake'> & { stake?: number }) => void;
  remove: (marketId: number, selection: string) => void;
  clear: () => void;
  totalStake: number;
  potentialPayout: number;
}

/** 下注单（前端暂存，提交时才调 API）—— 模块级单例，跨页面共享 */
let slipItems: BetSlipItem[] = [];
const slipListeners = new Set<() => void>();

function slipEmit() {
  slipListeners.forEach((l) => l());
}

export function useBetSlip(): BetSlipState {
  const [items, setItems] = useState<BetSlipItem[]>(slipItems);

  useEffect(() => {
    const listener = () => setItems([...slipItems]);
    slipListeners.add(listener);
    return () => {
      slipListeners.delete(listener);
    };
  }, []);

  const add = useCallback((item: Omit<BetSlipItem, 'stake'> & { stake?: number }) => {
    const next = { ...item, stake: item.stake ?? 100 };
    const exists = slipItems.find((i) => i.marketId === next.marketId && i.selection === next.selection);
    slipItems = exists ? slipItems.filter((i) => i !== exists) : [...slipItems, next];
    slipEmit();
  }, []);

  const remove = useCallback((marketId: number, selection: string) => {
    slipItems = slipItems.filter((i) => !(i.marketId === marketId && i.selection === selection));
    slipEmit();
  }, []);

  const clear = useCallback(() => {
    slipItems = [];
    slipEmit();
  }, []);

  const totalStake = items.reduce((sum, i) => sum + i.stake, 0);
  const potentialPayout = items.reduce((sum, i) => sum + i.stake * i.price, 0);

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
    const res = await api.placeBet(userId, item.marketId, item.selection, item.stake);
    results.push({ bet: res.bet, balance: res.account.balance });
  }
  return results;
}

export type { Match, User };
