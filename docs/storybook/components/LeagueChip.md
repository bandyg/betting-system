# LeagueChip

联赛彩色 chip — 根据联赛名 hash 生成稳定的 HSL 色相。

## Props

| Prop    | Type                | Default | 描述 |
|---------|---------------------|---------|------|
| `league`  | `string`          | —       | 联赛名称 |
| `size`    | `'xs' \| 'sm' \| 'md'` | `'sm'` | 尺寸 (xs=小 chip, sm=中, md=大) |
| `className` | `string`        | —       | 额外 class |

## 实现原理

1. **hashHue(league)**: 字符累乘 (h * 31 + char) % 360
2. **背景**: `hsl(hue, 70%, 92%)` 浅色
3. **首字 circle**: `hsl(hue, 70%, 55%)` 深色 + 白字
4. **sport emoji 推算**: league 名含 sport 关键字 (soccer/basketball/...) → 自动用对应 emoji，否则 🏆

## 用法

```tsx
import { LeagueChip } from './components/LeagueChip.js';

<LeagueChip league="Premier League" />
<LeagueChip league="La Liga" size="xs" />
<LeagueChip league="NBA" size="md" />
```

## Demo

```tsx
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
  <LeagueChip league="Premier League" />
  <LeagueChip league="La Liga" />
  <LeagueChip league="Serie A" />
  <LeagueChip league="Bundesliga" />
  <LeagueChip league="NBA" />
  <LeagueChip league="中超" />
</div>
```

## 实际位置
`apps/web/src/components/LeagueChip.tsx` (51 行)