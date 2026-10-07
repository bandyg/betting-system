# EmptyState

空状态占位 — 无数据时显示 emoji、标题、可选描述与操作按钮。

## Props

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `icon` | `string` | `'📭'` | emoji 图标（字号 40） |
| `title` | `string` | — | 主标题 |
| `text` | `string` | — | 兼容字段：`title` 缺省时作为标题 |
| `desc` | `string` | — | 副标题/提示（居中） |
| `actionLabel` | `string` | — | 操作按钮文案；需与 `onAction` 同时提供才渲染 |
| `onAction` | `() => void` | — | 操作按钮回调 |
| `testID` | `string` | `'empty-state'` | 测试标识（按钮为 `${testID}-action`） |

标题取值优先级：`title ?? text ?? '暂无数据'`。

## 用法

```tsx
import { EmptyState } from '@betting/ui';

<EmptyState
  icon="🎲"
  title="暂无投注记录"
  desc="去大厅点几个赔率试试"
  actionLabel="去大厅"
  onAction={() => navigation.navigate('Lobby')}
/>
```

## 实现原理

- 垂直居中布局，元素间距 8；主标题 `fontSize.lg` 加粗，描述 `fontSize.sm` 用 `textMuted` 色。
- 按钮为描边胶囊样式，仅当 `actionLabel` 与 `onAction` 都提供时渲染。

## 实际位置
`packages/ui/src/components.tsx`
