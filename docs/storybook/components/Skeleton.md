# Skeleton

加载骨架屏 — 渲染占位条避免布局跳动。

## 组件

### `<SkeletonList rows={n} />`
列表骨架屏（每行 12px 高的横条）。

### `<SkeletonTable rows={n} cols={m} />`
表格骨架屏（行 × 列矩阵）。

### `<SkeletonBlock height={px} />`
单个矩形块。

## 用法

```tsx
import { SkeletonList, SkeletonTable, SkeletonBlock } from './components/Skeleton.js';

{loading && <SkeletonList rows={4} />}
{loading && <SkeletonTable rows={5} cols={9} />}
```

## 实际位置
`apps/web/src/components/Skeleton.tsx`