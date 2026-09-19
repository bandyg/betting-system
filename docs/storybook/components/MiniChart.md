# MiniChart

零依赖 SVG 折线图。适用于嵌入式迷你图（赔率历史、趋势预览等）。

## Props

| Prop    | Type                | Default | 描述 |
|---------|---------------------|---------|------|
| `data`  | `number[]`          | —       | 数据点（按时间顺序） |
| `label` | `string`            | `''`    | tooltip 前缀 |
| `width` | `number`            | `200`   | SVG 宽度 (px) |
| `height`| `number`            | `50`    | SVG 高度 (px) |
| `color` | `string`            | `'var(--accent)'` | 线条颜色 |

## 实现原理

1. **padding**: 4 px 四周留白
2. **min/max**: 数据点最值映射到 (padding, height-padding)
3. **path**: `M x0 y0 L x1 y1 ...` 平滑连接
4. **填充**: path 闭合到下方形成淡色面积
5. **hover**: 圆形节点变大 + tooltip 显示 (label + value)

## 用法

```tsx
import { MiniChart } from './components/MiniChart.js';

// 赔率历史
<MiniChart data={[2.10, 2.05, 2.20, 2.30, 2.25, 2.40]} label="主胜" />

// 自定义颜色
<MiniChart data={prices} color="var(--success)" width={300} height={80} />

// 空数据
<MiniChart data={[]} />  // 显示 "暂无数据"
```

## Demo

```tsx
<MiniChart
  data={[2.1, 2.05, 2.2, 2.3, 2.25, 2.4, 2.35, 2.45]}
  label="主胜赔率"
  width={300}
  height={80}
/>
```

## 移动端
@media (max-width: 600px) { .mini-chart { display: none; } } — 隐藏节省空间

## 实际位置
`apps/web/src/components/MiniChart.tsx` (71 行)