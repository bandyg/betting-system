# Avatar

用户头像组件。无图时显示 hash 生成的彩色首字 circle。

## Props

| Prop    | Type                | Default | 描述 |
|---------|---------------------|---------|------|
| `name`  | `string \| null`    | `?`     | 用户名（用于 hash 颜色 + 首字） |
| `src`   | `string \| null`    | —       | 图片 URL（无时显示 fallback） |
| `size`  | `number`            | `28`    | 圆直径（px） |
| `className` | `string`        | —       | 额外 class |

## 实现原理

- **hashHue(str)**: 把字符串 hash 成 0-359 的色相 (稳定)
- **fallback**: 圆 + 浅色背景 + 深色首字
- **有 src**: 直接渲染 `<img>`

## 用法

```tsx
import { Avatar } from './components/Avatar.js';

// fallback (无图)
<Avatar name="betty" size={32} />

// 有图片
<Avatar name="betty" src="/avatars/betty.png" size={40} />

// 用户列表
{users.map(u => <Avatar key={u.id} name={u.name} size={24} />)}
```

## Demo

```tsx
<div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
  <Avatar name="alice" />
  <Avatar name="Bob" />
  <Avatar name="Charlie" />
  <Avatar name="张三" />
  <Avatar name="李四" />
  <Avatar name="A" size={20} />
  <Avatar name="B" size={48} />
</div>
```

预期输出：每个头像不同颜色（hash 决定），首字分别为 a/B/C/张/李/A/B。

## 实际位置
`apps/web/src/components/Avatar.tsx` (60 行)