# Button / OddsButton

通用按钮（渐变/幽灵/危险三种变体，带按压回弹与 loading 态）与赔率按钮（自动涨跌闪烁、加入下注单绿闪反馈）。

## Button

### Props

| Prop      | Type                                      | Default    | 描述 |
|-----------|-------------------------------------------|------------|------|
| `title`   | `string`                                  | —（必填）   | 按钮文案 |
| `onPress` | `() => void`                              | —          | 点击回调 |
| `variant` | `'gradient' \| 'ghost' \| 'danger'`       | `'gradient'` | `gradient` 紫→青渐变背景白字；`ghost` `t.bgElevated` 底 + `t.primary` 字；`danger` `t.danger` 底 |
| `disabled`| `boolean`                                 | `false`    | 禁用（透明度 0.5，不响应点击） |
| `loading` | `boolean`                                 | `false`    | 加载中：显示白色 `ActivityIndicator`，并禁用点击 |
| `style`   | `StyleProp<ViewStyle>`                   | —          | 外层附加样式（注意：背景/圆角由组件内部控制） |
| `testID`  | `string`                                  | —          | 测试 ID |

### 说明

- 固定高度 52、pill 圆角；无 `size` prop（尺寸由样式固定）。
- `disabled || loading` 均会禁用。
- 按压缩放由 reanimated 弹簧驱动：按下 0.96 → 松开 1.03 → 回 1。

## OddsButton

### Props

| Prop      | Type         | Default   | 描述 |
|-----------|--------------|-----------|------|
| `label`   | `string`     | —（必填）  | 玩法标签（小字，上方） |
| `price`   | `number`     | —（必填）  | 赔率，`price.toFixed(2)` 显示两位小数 |
| `active`  | `boolean`    | `false`   | 选中态：`t.oddsActiveBg` / `t.oddsActiveBorder`，否则 `t.oddsBg` / `t.oddsBorder` |
| `onPress` | `() => void` | —         | 点击回调（带 0.92→1.08→1 按压缩放） |

### 自动闪烁行为

- **赔率变化**：`price` 改变时自动闪一次 —— 变大绿闪、变小红闪（160ms 起 + 700ms 落的整面背景覆盖），接好赔率推送后无需额外代码。
- **加入下注单反馈**：`active` 从 `false → true` 时绿闪一次。
- 闪烁色取 `colors.success` / `colors.danger`（固定值，不随主题）。

## 用法

```tsx
import { Button, OddsButton } from '@betting/ui';

// 主操作（渐变）
<Button title="确认下注" onPress={submit} />

// 其它变体
<Button title="取消" variant="ghost" onPress={back} />
<Button title="删除" variant="danger" onPress={remove} />

// 加载 / 禁用
<Button title="提交中" loading />
<Button title="提交" disabled={!valid} onPress={submit} />

// 赔率按钮
<OddsButton label="主胜" price={1.85} active={picked} onPress={pick} />
<OddsButton label="客胜" price={2.1} onPress={pick} />
```

## 实际位置
`packages/ui/src/components.tsx`
