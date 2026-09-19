# ConfirmBet

下注确认弹窗 — 提交前最后一道防误操作屏障。

## Props

| Prop              | Type                  | Default | 描述 |
|-------------------|-----------------------|---------|------|
| `open`            | `boolean`             | —       | 是否显示 |
| `mode`            | `'single' \| 'parlay'`| —       | 当前模式 |
| `items`           | `ConfirmItem[]`       | —       | 投注明细 |
| `totalStake`      | `number`              | —       | 总投注 |
| `totalPotential`  | `number`              | —       | 可赢派彩 |
| `combinedPrice`   | `number \| undefined` | —       | 组合赔率 (parlay 时) |
| `onConfirm`       | `() => void`          | —       | 确认回调 |
| `onCancel`        | `() => void`          | —       | 取消回调 |

## ConfirmItem

```ts
interface ConfirmItem {
  marketId: number;
  matchLabel: string;
  marketLabel: string;
  selection: string;
  price: number;
  stake: number;
}
```

## 行为

- **8s 自动确认**（按钮显示倒计时 `(8s)(7s)...`）
- **ESC** 关闭
- **背景点击** 关闭
- **X 按钮** 关闭

## 实际位置
`apps/web/src/components/ConfirmBet.tsx` (125 行)

## Sprint
Sprint 2 #4 — 下注确认弹窗