# OddsChip

大厅/盘口赔率筹码：显示玩法标签与赔率，支持选中态与调价涨跌闪变（绿升红降边框脉冲）。

## Props

| Prop       | Type                          | Default          | 描述 |
|------------|-------------------------------|------------------|------|
| `label`    | `string`                      | —（必填）         | 玩法标签（如 `主胜`） |
| `price`    | `number`                      | —（必填）         | 赔率，内部 `price.toFixed(2)` 显示两位小数 |
| `selected` | `boolean`                     | `false`          | 选中态（在投注单中）：背景用 `t.oddsActiveBg`，数值用 `t.secondary` |
| `flash`    | `'up' \| 'down' \| null`      | `null`           | 实时调价闪烁：`up` 绿色 ▲、`down` 红色 ▼，1.2s 边框脉冲后自动复位 |
| `disabled` | `boolean`                     | `false`          | 禁用（透明度 0.45，不响应点击） |
| `onPress`  | `() => void`                  | —                | 点击回调 |
| `testID`   | `string`                      | `odds-${label}`  | 测试 ID |

### 涨跌闪变实现

- `flash` 变化时用 `withSequence` 跑 300ms 进 + 900ms 出的脉冲（共 1.2s）。
- 动画期间边框色切到 `t.success`（升）或 `t.danger`（降），边框加粗、`scale` 最高 1.05、轻微降透明度。
- 1.2s 后 `flashTone` 复位，边框回到 `t.borderStrong`；标签旁显示 ▲ / ▼ 箭头（同 1.2s 后消失，需外部重置 `flash` prop）。
- 依赖 `react-native-reanimated`。

## 用法

```tsx
import { OddsChip } from '@betting/ui';

// 普通筹码
<OddsChip label="主胜" price={1.85} onPress={() => pick('home')} />

// 已选中（在投注单中）
<OddsChip label="让球 -1.5" price={1.92} selected onPress={() => pick('ah')} />

// 收到调价推送时触发闪变
<OddsChip label="客胜" price={2.1} flash="up" onPress={() => pick('away')} />
<OddsChip label="大 2.5" price={1.78} flash="down" disabled />
```

## 实际位置
`packages/ui/src/oddsChip.tsx`
