# BetSlip

投注单 — 单注/组合 模式 + Accordion + 确认弹窗。

## Props

| Prop       | Type                            | 描述 |
|------------|---------------------------------|------|
| `items`    | `BasketItem[]`                  | 当前选 |
| `onRemove` | `(key: string) => void`         | 移除某项 |
| `onClear`   | `() => void`                    | 清空全部 |

## BasketItem

```ts
{
  key: string;          // `${marketId}:${selection}`
  marketId: number;
  matchLabel: string;
  marketLabel: string;
  selection: string;
  price: number;
}
```

## 模式 (Sprint 2 A3)

- **单注**: 每注独立 stake (perStakes 记录)
- **组合** (parlay): 单一 stake + 赔率相乘

## Accordion 折叠
每注 caret + 头部点击展开/折叠

## 确认弹窗 (#4)
点"提交下注" → 弹 ConfirmBet (8s 自动确认 / ESC 取消)

## 实际位置
`apps/web/src/panels/BetSlip.tsx` (~315 行)

## Sprint
Sprint 2 A3 + Sprint 2 #4