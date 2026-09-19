# Toast / ToastHost

全局 toast 通知系统 — 4 种类型 + action 按钮。

## API (store.ts)

```ts
toast.ok(text)        // 成功
toast.err(text)        // 失败（红）
toast.warn(text)       // 警告（黄）
toast.info(text)       // 提示（蓝）
toast.withAction(kind, text, { label, onClick })  // 带按钮
```

## 自动 dismiss

- 普通 toast: **3.5s** 自动消失
- 带 action: **8s** 自动消失（让用户有更多时间点按钮）
- 队列: 最多 3 个同时显示

## 用法

```tsx
import { toast } from '../store.js';

// 普通
toast.ok('保存成功');
toast.err('网络失败');

// 带重试按钮
toast.withAction('err', '服务异常', {
  label: '重试',
  onClick: () => reload(),
});
```

## 渲染

`<ToastHost />` 在 Layout 自动渲染，无需手动调用。

## 实际位置
- `apps/web/src/store.ts` (toast 对象)
- `apps/web/src/components/Toast.tsx` (ToastHost)