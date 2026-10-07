import { useCallback, useEffect, useRef, useState } from 'react';
import { api, setAuthToken, wsUrlFromApiBase } from './api';
import type {
  Bet,
  Match,
  User,
  MatchesResponse,
  UsersResponse,
  BetsResponse,
  ContentsResponse,
  PromotionsResponse,
  ClaimsResponse,
  UserPreferences,
  MyVip,
  WithdrawalsResponse,
  RiskLimits,
  DashboardStats,
  TrendPoint,
  HotMatch,
  UserAnalytics,
  SupportTicketList,
  SportsResponse,
  LeaguesResponse,
  SportInfo
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

export function useMatches(params?: { sport?: string; league?: string; status?: string }) {
  return useAsync<MatchesResponse>(() => api.listMatches(params), [params?.sport, params?.league, params?.status]);
}

export function useSports() {
  return useAsync<SportsResponse>(() => api.getSports());
}

export function useLeagues(sport?: string) {
  return useAsync<LeaguesResponse>(() => api.getLeagues(sport), [sport]);
}

export function useUsers() {
  return useAsync<UsersResponse>(() => api.listUsers());
}

export function useBets(userId?: number) {
  return useAsync<BetsResponse>(() => api.listBets(userId), [userId]);
}

export function useContents(status?: 'published' | 'draft' | 'scheduled' | 'archived', locale?: string) {
  return useAsync<ContentsResponse>(() => api.listContents(status, locale), [status, locale]);
}

export function usePromotions(status?: 'active' | 'expired') {
  return useAsync<PromotionsResponse>(() => api.listPromotions(status), [status]);
}

export function useClaims(promotionId?: number | null) {
  return useAsync<ClaimsResponse>(() => (promotionId ? api.listClaims(promotionId) : Promise.resolve({ count: 0, claims: [] })), [promotionId]);
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

export function useMyVip() {
  return useAsync<{ vip: MyVip }>(() => api.getMyVip());
}

export function useWithdrawals(opts: { all?: boolean; status?: 'pending' | 'approved' | 'rejected' | 'paid' } = {}) {
  return useAsync<WithdrawalsResponse>(() => api.listWithdrawals(opts), [opts.all, opts.status]);
}

export function useRiskLimits() {
  return useAsync<{ limits: RiskLimits }>(() => api.getRiskLimits());
}

// ---- Data Analytics (Step 31-34) ----

export function useAnalyticsDashboard() {
  return useAsync<{ dashboard: DashboardStats }>(() => api.getAnalyticsDashboard());
}

export function useAnalyticsTrends(days = 14) {
  return useAsync<{ trends: TrendPoint[] }>(() => api.getAnalyticsTrends(days), [days]);
}

export function useAnalyticsHotMatches(limit = 10) {
  return useAsync<{ matches: HotMatch[] }>(() => api.getAnalyticsHotMatches(limit), [limit]);
}

export function useAnalyticsUsers(limit = 10) {
  return useAsync<{ users: UserAnalytics[] }>(() => api.getAnalyticsUsers(limit), [limit]);
}

// ---- Customer Support 工单 (Step 4-5) ----

export function useSupportTickets(params?: { status?: string; category?: string; page?: number; pageSize?: number }) {
  return useAsync<SupportTicketList>(() => api.listSupportTickets(params), [
    params?.status,
    params?.category,
    params?.page,
    params?.pageSize,
  ]);
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

/** 宿主可注入的持久化适配器（RN 用 AsyncStorage；不注入则回落 localStorage） */
export interface AuthStorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

let authStorage: AuthStorageAdapter | null = null;

/** native 端启动时注入 AsyncStorage 等实现 */
export function setAuthStorage(adapter: AuthStorageAdapter) {
  authStorage = adapter;
}

function storage(): AuthStorageAdapter | Storage | null {
  if (authStorage) return authStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function persistUser(u: User | null) {
  try {
    const s = storage();
    if (!s) return;
    if (u) void s.setItem(STORAGE_KEY, JSON.stringify(u));
    else void s.removeItem(STORAGE_KEY);
  } catch {
    /* 存储不可用时忽略 */
  }
}

function persistToken(t: string | null) {
  try {
    const s = storage();
    if (!s) return;
    if (t) void s.setItem(TOKEN_KEY, t);
    else void s.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** 启动时从 localStorage 恢复登录态（web 端刷新不丢登录，同步返回） */
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

/** 异步恢复（native：经 setAuthStorage 注入的 AsyncStorage） */
export async function restoreSessionAsync(): Promise<User | null> {
  if (currentUser) return currentUser;
  const s = storage();
  if (!s) return null;
  try {
    const raw = await s.getItem(STORAGE_KEY);
    if (raw) {
      const u = JSON.parse(raw) as User;
      currentUser = u;
      const token = await s.getItem(TOKEN_KEY);
      if (token) setAuthToken(token);
      return u;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 测试用：重置模块级登录态与注入的适配器 */
export function resetAuthForTest() {
  currentUser = null;
  setAuthToken(null);
  authStorage = null;
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

/** 提交串关（整单一次下注，stake 为整单金额） */
export async function placeParlayItems(items: BetSlipItem[], stake: number): Promise<PlaceBetResult> {
  const res = await api.placeParlay(
    items.map((i) => ({ marketId: i.marketId, selection: i.selection })),
    stake,
  );
  return { bet: res.bet, balance: res.account.balance };
}

export type { Match, User };

// ---- WebSocket 实时赔率 ----

export interface OddsUpdateItem {
  marketId: number;
  odds: { selection: string; price: number }[];
}

/**
 * 实时赔率订阅：连接 wsUrlFromApiBase() 推导的 /ws/odds，
 * 收到 odds_batch 批量回调；指数退避重连 1s→30s，25s ping 保活。
 */
export function useLiveOdds(onUpdate: (updates: OddsUpdateItem[]) => void, enabled = true) {
  const cbRef = useRef(onUpdate);
  useEffect(() => {
    cbRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      let url: string;
      try {
        url = wsUrlFromApiBase();
      } catch {
        return; // native 未配置绝对 API base —— 静默不连
      }
      ws = new WebSocket(url);
      ws.onopen = () => {
        retry = 0;
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25_000);
      };
      ws.onmessage = (ev: { data?: unknown }) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg?.type === 'odds_batch' && Array.isArray(msg.updates)) cbRef.current(msg.updates);
        } catch {
          /* 非 JSON 消息忽略 */
        }
      };
      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        if (!closed) {
          const delay = Math.min(30_000, 1_000 * 2 ** retry++);
          reconnectTimer = setTimeout(connect, delay);
        }
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      ws?.close();
    };
  }, [enabled]);
}
