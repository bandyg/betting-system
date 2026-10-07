# Modal / ConfirmModal

通用弹窗容器与带倒计时自动确认的确认弹窗。backdrop 点击关闭，web 端支持 Esc 关闭。

## Modal

### Props

| Prop       | Type              | Default  | 描述 |
|------------|-------------------|----------|------|
| `visible`  | `boolean`         | —（必填） | 是否显示 |
| `onClose`  | `() => void`      | —（必填） | 关闭回调（backdrop / ✕ / Esc / `onRequestClose`） |
| `title`    | `string`          | —        | 标题；不传则不渲染标题栏与 ✕ 按钮 |
| `children` | `React.ReactNode` | —（必填） | 弹窗内容 |
| `width`    | `number`          | `480`    | 弹窗最大宽度（px） |
| `testID`   | `string`          | `modal`  | 测试 ID（backdrop 为 `${testID}-backdrop`，关闭按钮为 `${testID}-close`） |

### 行为

- `visible === false` 时返回 `null`（不渲染）。
- 半透明 backdrop（`rgba(4,6,12,0.6)`）点击关闭；内容区 `stopPropagation`。
- 仅 web 端监听 `Escape` 键关闭。
- 卡片背景 `t.bgElevated`，最大高度 90%，带阴影。

## ConfirmModal

### Props

| Prop            | Type              | Default      | 描述 |
|-----------------|-------------------|--------------|------|
| `visible`       | `boolean`         | —（必填）     | 是否显示 |
| `onCancel`      | `() => void`      | —（必填）     | 取消回调（也是关闭回调） |
| `onConfirm`     | `() => void`      | —（必填）     | 确认回调（倒计时归零时也会自动触发） |
| `title`         | `string`          | `确认操作`    | 标题 |
| `confirmLabel`  | `string`          | `确认`        | 确认按钮文案 |
| `cancelLabel`   | `string`          | `取消`        | 取消按钮文案 |
| `autoConfirmMs` | `number`          | —            | 自动确认倒计时时长（毫秒）；传入则显示倒计时，倒数到 0 自动 `onConfirm`（如旧版 8s 自动确认下注传 `8000`） |
| `children`      | `React.ReactNode` | —            | 确认说明内容 |
| `testID`        | `string`          | `confirm-modal` | 测试 ID（按钮为 `${testID}-cancel` / `${testID}-ok`） |

### 倒计时行为

- 传入 `autoConfirmMs` 后，弹窗显示 `Xs 后自动确认`，确认按钮文案变为 `确认（Xs）`。
- 每 250ms 刷新剩余秒数（向上取整），归零时自动 `onConfirm()`；关闭或卸载时清除定时器。
- 不传 `autoConfirmMs` 则为普通确认弹窗，无倒计时。

## 用法

```tsx
import { useState } from 'react';
import { Modal, ConfirmModal, Button } from '@betting/ui';

// 普通弹窗
const [open, setOpen] = useState(false);
<Modal visible={open} onClose={() => setOpen(false)} title="赛事详情">
  <Text>弹窗正文内容</Text>
</Modal>

// 确认下注：8s 自动确认
const [confirm, setConfirm] = useState(false);
<ConfirmModal
  visible={confirm}
  onCancel={() => setConfirm(false)}
  onConfirm={() => { setConfirm(false); submitBet(); }}
  title="确认下注"
  confirmLabel="确认"
  autoConfirmMs={8000}
>
  <Text>主队 vs 客队 · 1.85</Text>
</ConfirmModal>
```

## 实际位置
`packages/ui/src/modal.tsx`
