import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { create } from 'zustand';
import { useTheme } from './theme';
import { radius, fontSize, spacing } from './tokens';

/* ---------------- Toast store（模块级单例，组件外可直接调用） ---------------- */

export type ToastKind = 'ok' | 'err' | 'warn' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-3) }));
    const ttl = t.actionLabel ? 8000 : 3500;
    setTimeout(() => get().dismiss(id), ttl);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** 命令式助手：toast.ok('...') / toast.err('...') / toast.withAction({...}) */
export const toast = {
  ok: (text: string) => useToastStore.getState().push({ kind: 'ok', text }),
  err: (text: string) => useToastStore.getState().push({ kind: 'err', text }),
  warn: (text: string) => useToastStore.getState().push({ kind: 'warn', text }),
  info: (text: string) => useToastStore.getState().push({ kind: 'info', text }),
  withAction: (kind: ToastKind, text: string, actionLabel: string, onAction: () => void) =>
    useToastStore.getState().push({ kind, text, actionLabel, onAction }),
};

/** 统一 API 错误 → toast（BusinessError 直显，网络/服务端带重试按钮） */
export function toastApiError(e: unknown, opts?: { retry?: () => void; prefix?: string }) {
  const prefix = opts?.prefix ?? '';
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  if (opts?.retry && (status === undefined || status >= 500)) {
    toast.withAction('err', `${prefix}${msg}`, '重试', opts.retry);
  } else {
    toast.err(`${prefix}${msg}`);
  }
}

/* ---------------- ToastHost（挂在应用根部，右下角浮层） ---------------- */

export function ToastHost() {
  const t = useTheme();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => () => useToastStore.setState({ toasts: [] }), []);

  const tone = (k: ToastKind) =>
    k === 'ok' ? t.success : k === 'err' ? t.danger : k === 'warn' ? t.warning : t.info;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: spacing.lg, bottom: spacing.xl, gap: spacing.sm, zIndex: 999, alignItems: 'flex-end' }}>
      {toasts.map((item) => (
        <Animated.View
          key={item.id}
          entering={FadeInDown.duration(200)}
          exiting={FadeOutUp.duration(150)}
          style={{
            backgroundColor: t.bgElevated,
            borderColor: tone(item.kind),
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            maxWidth: 420,
          }}
        >
          <Text style={{ color: tone(item.kind), fontSize: fontSize.sm, fontWeight: '700' }}>
            {item.kind === 'ok' ? '✓' : item.kind === 'err' ? '✕' : item.kind === 'warn' ? '⚠' : 'ℹ'}
          </Text>
          <Text style={{ color: t.text, fontSize: fontSize.sm, flexShrink: 1 }}>{item.text}</Text>
          {item.actionLabel ? (
            <Pressable
              testID={`toast-action-${item.id}`}
              onPress={() => {
                item.onAction?.();
                dismiss(item.id);
              }}
              hitSlop={6}
            >
              <Text style={{ color: t.secondary, fontSize: fontSize.sm, fontWeight: '800' }}>{item.actionLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable testID={`toast-close-${item.id}`} onPress={() => dismiss(item.id)} hitSlop={6}>
            <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>✕</Text>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}
