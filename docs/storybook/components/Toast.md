# Toast / ToastHost

全局提示系统 — zustand store + 命令式 API，`ToastHost` 在右下角渲染浮层。

## Props

`ToastHost` 无 props，挂在应用根部渲染一次。命令式 API（组件外可直接调用）：

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `toast.ok(text)` | `(text: string) => void` | — | 成功提示（绿 ✓） |
| `toast.err(text)` | `(text: string) => void` | — | 失败提示（红 ✕） |
| `toast.warn(text)` | `(text: string) => void` | — | 警告提示（黄 ⚠） |
| `toast.info(text)` | `(text: string) => void` | — | 信息提示（蓝 ℹ） |
| `toast.withAction(kind, text, actionLabel, onAction)` | `(kind: ToastKind, text: string, actionLabel: string, onAction: () => void) => void` | — | 带操作按钮的提示 |
| `toastApiError(e, opts?)` | `(e: unknown, opts?: { retry?: () => void; prefix?: string }) => void` | — | API 错误统一转 toast：给了 `retry` 且 `status` 缺省或 ≥500 时带「重试」按钮，否则直接红条 |
| `useToastStore` | zustand hook | — | 直读 store：`toasts` / `push` / `dismiss` |

类型：`ToastKind = 'ok' \| 'err' \| 'warn' \| 'info'`；`ToastItem = { id, kind, text, actionLabel?, onAction? }`。

## 自动 dismiss

- 普通 toast：**3.5s** 自动消失。
- 带 `actionLabel`：**8s** 自动消失（留时间点按钮）。
- 队列：最多 **3** 条同时显示（`slice(-3)`，新条挤掉旧条）。

## 用法

```tsx
import { ToastHost, toast, toastApiError } from '@betting/ui';

// 应用根部挂一次
<ToastHost />

// 任何地方命令式调用
toast.ok('保存成功');
toast.err('网络失败');
toast.warn('赔率已变化');
toast.info('连接已恢复');

// 带「重试」按钮
toast.withAction('err', '服务异常', '重试', () => reload());

// API 错误统一处理
try {
  await api.save();
} catch (e) {
  toastApiError(e, { prefix: '保存失败: ', retry: () => api.save() });
}
```

## 实现原理

- 模块级单例 zustand store（`useToastStore`），组件外经 `useToastStore.getState()` 推送。
- `ToastHost` 绝对定位右下（right `spacing.lg` / bottom `spacing.xl`，`zIndex 999`）；`FadeInDown` 200ms 进场、`FadeOutUp` 150ms 退场，单条 `maxWidth 420`；卸载时清空队列。
- 每条含语义色边框 + 图标、关闭按钮（`toast-close-${id}`）、可选操作按钮（`toast-action-${id}`，点击执行回调并关闭）。

## 实际位置
`packages/ui/src/toast.tsx`
