# Skeleton

加载骨架屏家族 — 呼吸闪烁占位，避免加载时布局跳动。共 5 个导出。

## Props

### `SkeletonLine`

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `w` | `number \| string` | `'100%'` | 条宽（数字 px 或百分比字符串） |
| `h` | `number` | `12` | 条高（px） |

### `SkeletonBlock`

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `h` | `number` | `80` | 矩形块高度（px，宽度撑满容器） |

### `SkeletonList`

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `rows` | `number` | `5` | 列表行数 |

### `SkeletonTable`

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `rows` | `number` | `6` | 数据行数 |
| `cols` | `number` | `4` | 列数 |

### `SkeletonAny`

即 `SkeletonLine` 的兼容别名（props 同 `SkeletonLine`），用于兼容旧调用方。

## 用法

```tsx
import { SkeletonLine, SkeletonBlock, SkeletonList, SkeletonTable, SkeletonAny } from '@betting/ui';

{loading && <SkeletonList rows={4} />}
{loading && <SkeletonTable rows={6} cols={4} />}
{loading && <SkeletonBlock h={120} />}
{loading && <SkeletonLine w="60%" h={10} />}
```

## 实现原理

- 内部 `Pulse` 容器：react-native-reanimated 透明度 0.45 ↔ 1、900ms 往复循环（shimmer 等价物），带 `accessibilityLabel="loading"`、`testID="skeleton"`。
- 条形 `Bar` 用主题 `t.border` 底色 + `radius.sm` 圆角。
- `SkeletonList` 每行 = 36px 圆形头像占位（紫 25% 透明底）+ 55% / 30% 两条文字占位。
- `SkeletonTable` = 表头行（底部 1px 分隔线）+ N 行错落条，列宽按 `18/32/22/16/10/20%` 循环取值，`testID="skeleton-table"`。

## 实际位置
`packages/ui/src/skeleton.tsx`
