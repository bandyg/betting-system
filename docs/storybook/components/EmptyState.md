# EmptyState

空状态占位组件 — 无数据时显示。

## Props

| Prop    | Type      | Default | 描述 |
|---------|-----------|---------|------|
| `icon`  | `string`  | `'📭'`  | emoji 图标 |
| `title` | `string`  | —       | 主标题 |
| `desc`  | `string`  | —       | 副标题/提示 |
| `action`| `ReactNode` | —     | 操作按钮 (可选) |

## 用法

```tsx
import { EmptyState } from './components/EmptyState.js';

<EmptyState
  icon="🎲"
  title="暂无投注记录"
  desc="去大厅点几个赔率试试"
  action={<button onClick={...}>去大厅</button>}
/>
```

## 实际位置
`apps/web/src/components/EmptyState.tsx`