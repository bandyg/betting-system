import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@betting/core';
import type { Match, MatchListParams } from '@betting/core';

/** 每页条数（与 API 约定一致） */
export const PLAYER_MATCH_PAGE_SIZE = 40;
/** 搜索输入防抖 */
const QUERY_DEBOUNCE_MS = 300;
/** from = now - 3h：让刚开赛/进行中的赛事仍出现在窗口内 */
const LIVE_LOOKBACK_MS = 3 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export type MatchWhen = 'today' | '3d' | 'all';

export interface PlayerMatchFilters {
  q: string;
  sport: string | null;
  league: string | null;
  when: MatchWhen;
  onlyOpen: boolean;
}

export const DEFAULT_PLAYER_MATCH_FILTERS: PlayerMatchFilters = {
  q: '',
  sport: null,
  league: null,
  when: '3d',
  onlyOpen: false,
};

interface MatchListPage {
  total: number;
  hasMore: boolean;
  matches: Match[];
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** today => 本地今天 00:00 到明天 00:00；3d => now-3h ~ now+3d；all => now-3h 起，无上限 */
function buildWindow(when: MatchWhen): { from: string; to?: string } {
  const now = new Date();
  if (when === 'today') {
    const from = startOfLocalDay(now);
    const to = new Date(from.getTime());
    to.setDate(to.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const from = new Date(now.getTime() - LIVE_LOOKBACK_MS).toISOString();
  if (when === '3d') {
    return { from, to: new Date(now.getTime() + THREE_DAYS_MS).toISOString() };
  }
  return { from };
}

/**
 * 兼容旧 API：缺 total / hasMore 时回落到 count 与「本页是否满页」。
 * 用 unknown 做运行时归一化，不引入 any 断言。
 */
function normalizePage(raw: unknown, pageSize: number): MatchListPage {
  const node = (raw ?? {}) as { count?: unknown; total?: unknown; hasMore?: unknown; matches?: unknown };
  const matches: Match[] = Array.isArray(node.matches) ? (node.matches as Match[]) : [];
  const count = typeof node.count === 'number' ? node.count : matches.length;
  const total = typeof node.total === 'number' ? node.total : count;
  const hasMore =
    typeof node.hasMore === 'boolean' ? node.hasMore : matches.length === pageSize;
  return {
    total,
    // 空页强制终止，避免服务端 hasMore 陈旧时无限触底
    hasMore: matches.length === 0 ? false : hasMore,
    matches,
  };
}

/** 按 match.id 去重追加，保证翻页重叠不会产生重复 key */
function mergeMatches(prev: Match[], next: Match[]): Match[] {
  const seen = new Set(prev.map((m) => m.id));
  const merged = prev.slice();
  for (const match of next) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    merged.push(match);
  }
  return merged;
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return '加载失败';
}

type FetchMode = 'initial' | 'refresh' | 'more';

export interface PlayerMatchesResult {
  /** 已加载的赛事（按服务端排序，翻页去重后累积） */
  rowsSource: Match[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => void;
  loadMore: () => void;
}

export function usePlayerMatches(filters: PlayerMatchFilters): PlayerMatchesResult {
  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const [rowsSource, setRowsSource] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const seqRef = useRef(0);
  const busyRef = useRef(false);
  const rowsRef = useRef<Match[]>([]);
  const hasMoreRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // 让在途请求的结果失效
      seqRef.current += 1;
    };
  }, []);

  // 搜索防抖：300ms 空闲后才触发请求
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(filters.q), QUERY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.q]);

  // 只在真正影响请求的字段变化时重建请求构造器
  const buildParams = useCallback(
    (offset: number): MatchListParams => {
      const window = buildWindow(filters.when);
      const params: MatchListParams = {
        status: 'scheduled',
        sort: 'kickoff_asc',
        limit: PLAYER_MATCH_PAGE_SIZE,
        offset,
        from: window.from,
      };
      if (window.to) params.to = window.to;
      const keyword = debouncedQ.trim();
      if (keyword) params.q = keyword;
      if (filters.sport) params.sport = filters.sport;
      if (filters.league) params.league = filters.league;
      if (filters.onlyOpen) params.withOdds = true;
      return params;
    },
    [debouncedQ, filters.sport, filters.league, filters.when, filters.onlyOpen],
  );

  const fetchPage = useCallback(
    async (offset: number, mode: FetchMode) => {
      const seq = ++seqRef.current;
      busyRef.current = true;

      if (mode === 'initial') {
        // 筛选变化：立即清空旧数据，进入骨架屏
        rowsRef.current = [];
        hasMoreRef.current = false;
        setRowsSource([]);
        setTotal(0);
        setHasMore(false);
        setLoadingMore(false);
        setRefreshing(false);
        setLoading(true);
      } else if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const params = buildParams(offset);
        // 兼容旧 core 签名：参数对象先按本地契约定型，再交给 api.listMatches
        const raw: unknown = await api.listMatches(params);
        if (!mountedRef.current || seq !== seqRef.current) return;

        const page = normalizePage(raw, PLAYER_MATCH_PAGE_SIZE);
        if (mode === 'more') {
          const merged = mergeMatches(rowsRef.current, page.matches);
          rowsRef.current = merged;
          setRowsSource(merged);
        } else {
          rowsRef.current = page.matches;
          setRowsSource(page.matches);
        }
        hasMoreRef.current = page.hasMore;
        setHasMore(page.hasMore);
        setTotal(page.total);
      } catch (e) {
        if (!mountedRef.current || seq !== seqRef.current) return;
        setError(messageOf(e));
      } finally {
        if (mountedRef.current && seq === seqRef.current) {
          busyRef.current = false;
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [buildParams],
  );

  // 任一筛选条件变化（含防抖后的关键词）都从 offset 0 重新拉取
  useEffect(() => {
    void fetchPage(0, 'initial');
  }, [fetchPage]);

  const refresh = useCallback(() => {
    // 列表为空时用 initial 以展示骨架屏，否则保持列表做下拉刷新
    void fetchPage(0, rowsRef.current.length === 0 ? 'initial' : 'refresh');
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    // busyRef 同步拦截重复触底；hasMoreRef 避免无效翻页
    if (busyRef.current || !hasMoreRef.current) return;
    void fetchPage(rowsRef.current.length, 'more');
  }, [fetchPage]);

  return {
    rowsSource,
    total,
    loading,
    loadingMore,
    refreshing,
    error,
    hasMore,
    refresh,
    loadMore,
  };
}
