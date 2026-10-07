# MiniChart

SVG 折线迷你图（网格 + 折线 + 渐变面积填充），适用于赔率历史、趋势预览等嵌入式场景。

## Props

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `data` | `number[]` | —（必填） | 数据点（按时间顺序） |
| `width` | `number` | `Math.min(窗口宽 - 80, 360)` | 图宽（px），不传时按屏宽自适应 |
| `height` | `number` | `64` | 图高（px） |
| `label` | `string` | — | 右上角小字标注（如「主胜」） |
| `testID` | `string` | `'mini-chart'` | 测试标识 |

## 用法

```tsx
import { MiniChart } from '@betting/ui';

// 赔率历史
<MiniChart data={[2.10, 2.05, 2.20, 2.30, 2.25, 2.40]} label="主胜" />

// 自定义尺寸
<MiniChart data={history} width={300} height={80} />

// 空数据：显示「暂无走势」占位
<MiniChart data={[]} />
```

## 实现原理

- 先过滤非有限数字；有效点 < 2 时渲染居中「暂无走势」占位，不画图。
- `pad = 4`，按 min/max 归一化映射 y 坐标；25% / 50% / 75% 三条水平网格线。
- 折线 `Path` + 下方 `LinearGradient` 面积填充（透明度 0.28 → 0.02）。
- 配色随走势：末点 ≥ 首点用主题 `success`（绿），否则 `danger`（红）。
- `label` 绝对定位在右上角；无 hover / tooltip（React Native SVG）。

## 实际位置
`packages/ui/src/chart.tsx`
