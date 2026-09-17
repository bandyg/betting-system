// store.ts — zustand 全局 store：auth + toast + theme
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setAuthToken } from '@betting/core';
import type { User } from '@betting/core';
import { BusinessError, ServerError, NetworkError } from './api/errors.js';

export type Theme = 'dark' | 'light';
export type ToastKind = 'ok' | 'err' | 'warn' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; onClick: () => void };
}

interface AuthState {
  user: User | null;
  role: string;
  setAuth: (u: User | null, role: string, token: string | null) => void;
  clear: () => void;
}
interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, text: string, action?: Toast['action'], autoDismissMs?: number) => void;
  dismiss: (id: number) => void;
}
interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

// ── Auth (持久化到 localStorage) ──
export const useAuth = create<AuthState>()(
  persist(
    (set: (partial: Partial<AuthState>) => void) => ({
      user: null,
      role: '',
      setAuth: (u, role, token) => {
        if (token) setAuthToken(token);
        else setAuthToken(null);
        set({ user: u, role });
      },
      clear: () => {
        setAuthToken(null);
        set({ user: null, role: '' });
      },
    }),
    {
      name: 'betting.auth',
      partialize: (s: AuthState) => ({ user: s.user, role: s.role }),
    },
  ),
);

// ── Toast (in-memory, 3.5s auto-dismiss) ──
let _id = 0;
export const useToast = create<ToastState>(
  (set: (partial: Partial<ToastState> | ((s: ToastState) => Partial<ToastState>)) => void,
   get: () => ToastState) => ({
    toasts: [],
    push: (kind, text, action, autoDismissMs) => {
      const id = ++_id;
      set((s) => {
        const next = [...s.toasts, { id, kind, text, action }];
        if (next.length > 3) next.shift();
        return { toasts: next };
      });
      const ms = autoDismissMs ?? (action ? 8000 : 3500);
      window.setTimeout(() => get().dismiss(id), ms);
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  }),
);

// 便捷方法（不绑 hook，可在任意函数中调用）
export const toast = {
  ok: (t: string) => useToast.getState().push('ok', t),
  err: (t: string) => useToast.getState().push('err', t),
  warn: (t: string) => useToast.getState().push('warn', t),
  info: (t: string) => useToast.getState().push('info', t),
  // 带按钮的 toast（点按钮不自动 dismiss）
  withAction: (kind: ToastKind, text: string, action: { label: string; onClick: () => void }) =>
    useToast.getState().push(kind, text, action, 8000),
};

// ── 统一错误处理 helper（Sprint 1 B1）──
// 调用方式：handleApiError(e, { retry: () => doApiCall() })
// 会按错误类型选合适 toast（含重试按钮）
export function handleApiError(e: unknown, opts?: { retry?: () => void; prefix?: string }): void {
  const prefix = opts?.prefix ? `${opts.prefix}：` : '';
  if (e instanceof BusinessError) {
    // 4xx 业务错误 — 直接显示后端 message
    useToast.getState().push('err', `${prefix}${e.message}`, undefined, 5000);
  } else if (e instanceof ServerError) {
    // 5xx — 重试按钮
    useToast.getState().push(
      'err',
      `${prefix}服务异常（${e.status}），请稍后重试`,
      opts?.retry ? { label: '重试', onClick: opts.retry } : undefined,
      8000,
    );
  } else if (e instanceof NetworkError) {
    // 网络 — 重试按钮
    useToast.getState().push(
      'err',
      `${prefix}网络连接失败，请检查后重试`,
      opts?.retry ? { label: '重试', onClick: opts.retry } : undefined,
      8000,
    );
  } else {
    // 未知错误
    const msg = e instanceof Error ? e.message : String(e);
    useToast.getState().push('err', `${prefix}${msg}`);
  }
}

// ── Theme (持久化到 localStorage + html data-theme) ──
export const useTheme = create<ThemeState>()(
  persist(
    (set: (partial: Partial<ThemeState>) => void, get: () => ThemeState) => ({
      theme: 'dark' as Theme,
      toggle: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        set({ theme: next });
      },
      set: (t) => {
        document.documentElement.setAttribute('data-theme', t);
        set({ theme: t });
      },
    }),
    { name: 'betting.theme' },
  ),
);

// 启动时从 localStorage 恢复主题（在 main.tsx 调用一次）
export function initTheme(): void {
  try {
    const raw = localStorage.getItem('betting.theme');
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { theme?: Theme } };
      const t: Theme = parsed.state?.theme ?? 'dark';
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch {
    /* ignore */
  }
}
