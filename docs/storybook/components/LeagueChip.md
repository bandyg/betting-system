# LeagueChip

联赛彩色徽章 — 按联赛名 hash 出稳定色相的圆点 + 文字 chip。

## Props

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `league` | `string` | —（必填） | 联赛名称（空时显示 `—`） |
| `sport` | `string` | — | 运动类型；命中映射表时前置 emoji（如 `soccer` → ⚽） |
| `size` | `'xs' \| 'sm' \| 'md'` | `'sm'` | 尺寸档位（缩放系数 xs=0.8 / sm=1 / md=1.2） |
| `testID` | `string` | — | 测试标识 |

## 用法

```tsx
import { LeagueChip } from '@betting/ui';

<LeagueChip league="Premier League" sport="soccer" />
<LeagueChip league="NBA" sport="basketball" size="md" />
<LeagueChip league="中超" size="xs" />
```

## 实现原理

- `hashHue(league)` 得色相：底色 `hsla(hue, 60%, 45%, 0.16)`，边框 `hsla(hue, 60%, 55%, 0.4)`，pill 圆角。
- 左侧色点：`max(6, round(8 * scale))` 直径，颜色 `hsl(hue, 60%, 55%)`。
- `sport` 映射 emoji：soccer/basketball/tennis/baseball/hockey/mma/cricket/rugby/boxing/esports；未命中则只显示圆点 + 文字。
- 文字 `11 * scale` 号、`fontWeight 600`、单行截断（`numberOfLines={1}`）；字号、间距、内边距均随 `scale` 缩放。

## 实际位置
`packages/ui/src/primitives.tsx`
