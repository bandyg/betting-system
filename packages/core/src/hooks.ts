import { useCallback, useEffect, useState } from 'react';
import { api, setAuthToken } from './api';
import type {
  Bet,
  Match,
  User,
  MatchesResponse,
  UsersResponse,
  BetsResponse,
  ContentsResponse,
  PromotionsResponse,
  UserPreferences
} from './types';

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

export function useContents(status?: 'published' | 'draft') {
  return useAsync<ContentsResponse>(() => api.listContents(status), [status]);
}

export function usePromotions(status?: 'active' | 'expired') {
  return useAsync<PromotionsResponse>(() => api.listPromotions(status), [status]);
}

export function usePreferences(userId?: number | null) {
  return useAsync<{ preferences: UserPreferences }>(
    () =>
      userId
        ? api.getPreferences(userId)
        : Promise.resolve({ preferences: { favorite_team: null, marketing_opt_in: false } }),
    [userId],
  );
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
    persistUser(u);
    emit();
  }, []);

  const update = useCallback((u: User) => {
    currentUser = u;
    persistUser(u);
    emit();
  }, []);

  const clear = useCallback(() => {
    currentUser = null;
    persistUser(null);
    emit();
  }, []);

  return { user, select, update, clear };
}

// ---- 登录/注册/退出（密码鉴权版） ----

const STORAGE_KEY = 'betting.currentUser';
const TOKEN_KEY = 'betting.token';

function persistUser(u: User | null) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      else localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* web localStorage 不可用时忽略 */
  }
}

function persistToken(t: string | null) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** 启动时从 localStorage 恢复登录态（web 端刷新不丢登录） */
export function restoreSession(): User | null {
  if (currentUser) return currentUser;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const u = JSON.parse(raw) as User;
        currentUser = u;
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) setAuthToken(token);
        return u;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export interface AuthState {
  user: User | null;
  login: (name: string, password: string) => Promise<User>;
  register: (name: string, password: string) => Promise<User>;
  logout: () => void;
  update: (u: User) => void;
}

export function useAuth(): AuthState {
  const { user, select, update, clear } = useCurrentUser();

  const login = useCallback(
    async (name: string, password: string) => {
      const res = await api.login(name, password);
      setAuthToken(res.token);
      persistToken(res.token);
      select(res.user);
      return res.user;
    },
    [select],
  );

  const register = useCallback(
    async (name: string, password: string) => {
      const res = await api.register(name, password);
      setAuthToken(res.token);
      persistToken(res.token);
      select(res.user);
      return res.user;
    },
    [select],
  );

  const logout = useCallback(() => {
    // 通知服务端作废 token（失败也继续本地登出）
    api.logout().catch(() => {});
    setAuthToken(null);
    persistToken(null);
    clear();
  }, [clear]);

  return { user, login, register, logout, update };
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
