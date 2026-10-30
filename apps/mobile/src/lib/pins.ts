/**
 * 赛事钉选（收藏）——localStorage 持久化的模块级单例 store。
 * v3：EventRow 星标 + 侧边栏「我的关注」计数共用。
 */
import { useEffect, useState } from 'react';

const KEY = 'betting.pinnedMatches';
let pinned: Set<number> = new Set();
const listeners = new Set<() => void>();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(KEY);
      if (raw) pinned = new Set(JSON.parse(raw) as number[]);
    }
  } catch {
    /* ignore */
  }
}

function persist() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify([...pinned]));
    }
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function isPinned(matchId: number): boolean {
  load();
  return pinned.has(matchId);
}

export function togglePin(matchId: number) {
  load();
  if (pinned.has(matchId)) pinned.delete(matchId);
  else pinned.add(matchId);
  persist();
  emit();
}

export function pinnedCount(): number {
  load();
  return pinned.size;
}

export function pinnedIds(): number[] {
  load();
  return [...pinned];
}

/** 订阅钉选状态的 hook（返回版本号触发重渲染） */
export function usePins(): {
  count: number;
  ids: () => number[];
  has: (id: number) => boolean;
  toggle: (id: number) => void;
} {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    load();
    setVersion((v) => v + 1); // 挂载时同步已持久化的数据
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    count: pinnedCount(),
    ids: pinnedIds,
    has: (id: number) => {
      void version;
      load();
      return pinned.has(id);
    },
    toggle: (id: number) => {
      togglePin(id);
    },
  };
}
