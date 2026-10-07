# Avatar

用户头像 — 有 `src` 时显示圆形图片，否则按 `name` hash 出稳定底色并显示首字母。

## Props

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `name` | `string` | —（必填） | 用户名，用于 hash 颜色与首字母 |
| `src` | `string` | — | 头像图片 URL；提供后渲染图片而非首字 |
| `size` | `number` | `32` | 圆形直径（px） |
| `testID` | `string` | — | 测试标识 |

## 用法

```tsx
import { Avatar } from '@betting/ui';

// 首字 fallback（无图）
<Avatar name="betty" />

// 有图片
<Avatar name="betty" src="https://example.com/avatar.png" size={40} />

// 用户列表
{users.map(u => <Avatar key={u.id} name={u.name} size={24} />)}
```

## 实现原理

- `hashHue(name)`：字符累乘 `(h * 31 + char) % 360` 得 0–359 色相，同名恒定；底色 `hsl(hue, 52%, 42%)`。
- 无 `src`：取 `name` 首字符大写，白色加粗，字号 `round(size * 0.42)`，居中。
- 有 `src`：渲染 `<Image>`；整体 `borderRadius = size / 2` 裁成圆形。

## 实际位置
`packages/ui/src/primitives.tsx`
