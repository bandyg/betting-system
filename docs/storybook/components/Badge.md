# Badge

状态徽章：按 `status` 从 `statusTone` 映射语义色调，取色随主题自动切换。

## Props

| Prop     | Type     | Default        | 描述 |
|----------|----------|----------------|------|
| `status` | `string` | —（必填）      | 状态键（如 `open`、`settled`），查 `statusTone` 得语义色调 |
| `label`  | `string` | `status`       | 显示文案，不传则直接显示 `status` |
| `testID` | `string` | `badge-${status}` | 测试 ID |

### status → tone 映射（tokens.ts `statusTone`）

| tone     | status |
|----------|--------|
| `info`     | `scheduled`、`open`、`in_progress` |
| `success`  | `settled`、`resolved` |
| `warning`  | `finished`、`waiting_user`、`suspended` |
| `neutral`  | `closed`（以及所有未登记的 status） |

色调颜色取自当前主题（`t.info` / `t.success` / `t.warning` / `t.textMuted`），背景为对应色 15% 透明度（neutral 用 `t.border`）。

## 用法

```tsx
import { Badge } from '@betting/ui';

<Badge status="open" />
<Badge status="settled" label="已结算" />
<Badge status="suspended" />
```

## 实际位置
`packages/ui/src/primitives.tsx`
