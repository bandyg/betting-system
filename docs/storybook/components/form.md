# Form 表单组件

受控输入框 Input 与跨端一致的下拉选择器 Select（含泛型 `SelectOption`）。

## Input

受控文本输入框（RN `TextInput` 封装，主题取色）。

### Props

| Prop              | Type                                                        | Default | 描述 |
|-------------------|-------------------------------------------------------------|---------|------|
| `value`           | `string`                                                    | —（必填） | 当前值（受控） |
| `onChangeText`    | `(v: string) => void`                                       | —（必填） | 文本变化回调 |
| `placeholder`     | `string`                                                    | —       | 占位文案（颜色用 `t.textMuted`） |
| `secureTextEntry` | `boolean`                                                   | `false` | 密码模式（隐藏输入） |
| `keyboardType`    | `'default' \| 'numeric' \| 'decimal-pad' \| 'email-address'`| `'default'` | 键盘类型 |
| `onSubmitEditing` | `() => void`                                                | —       | 提交（回车）回调 |
| `multiline`       | `boolean`                                                   | `false` | 多行（同时加大垂直内边距） |
| `autoFocus`       | `boolean`                                                   | `false` | 自动聚焦 |
| `testID`          | `string`                                                    | —       | 测试 ID |
| `style`           | `object`                                                    | —       | 附加样式（合并在组件默认样式之后） |

> 样式：`t.bg` 底 + `t.borderStrong` 边框、`radius.md` 圆角、`fontSize.md` 字号、最小宽度 120。

## Select

下拉选择器：不用系统 picker，点击展开绝对定位的选项列表，跨端表现一致且 `testID` 可测。

### `SelectOption<V>`

```ts
interface SelectOption<V = string> {
  value: V;
  label: string;
}
```

### Props

`Select` 是泛型组件：`Select<V extends string | number>`，`value` / `options` / `onChange` 三者类型联动。

| Prop        | Type                              | Default   | 描述 |
|-------------|-----------------------------------|-----------|------|
| `value`     | `V \| null`                       | —（必填）  | 当前选中值；`null` 或未匹配到选项时显示 `placeholder` |
| `options`   | `SelectOption<V>[]`               | —（必填）  | 选项列表 |
| `onChange`  | `(v: V) => void`                  | —（必填）  | 选中回调（选择后自动收起） |
| `placeholder` | `string`                        | `请选择`   | 未选中时的占位文案 |
| `testID`    | `string`                          | —         | 触发器测试 ID（选项为 `${testID}-option-${value}`） |
| `style`     | `object`                          | —         | 外层容器附加样式（默认 `minWidth: 140`） |

### 行为

- 触发器：`t.bg` 底 + `t.borderStrong` 边框，左侧当前 label（未选中用 `t.textMuted`），右侧 ▾。
- 列表：`t.bgElevated` 底、`zIndex: 100`、最高 260 可滚动，带阴影；选中项 `t.oddsActiveBg` 底 + `t.secondary` 字，按下项 `t.border` 底。
- 点击选项 → `onChange(value)` 并关闭；再次点击触发器可重新展开（点外部关闭需自行处理，组件未做遮罩）。

## 用法

```tsx
import { useState } from 'react';
import { Input, Select, type SelectOption } from '@betting/ui';

// Input
const [kw, setKw] = useState('');
<Input value={kw} onChangeText={setKw} placeholder="搜索赛事" testID="search" />
<Input value={amt} onChangeText={setAmt} placeholder="投注金额" keyboardType="decimal-pad" />

// Select（string 泛型）
const [sport, setSport] = useState<string | null>(null);
const sports: SelectOption[] = [
  { value: 'soccer', label: '足球' },
  { value: 'basketball', label: '篮球' },
];
<Select value={sport} options={sports} onChange={setSport} placeholder="选择运动" testID="sport" />

// Select（number 泛型）
const [leagueId, setLeagueId] = useState<number | null>(null);
const leagues: SelectOption<number>[] = [
  { value: 1, label: '英超' },
  { value: 2, label: '西甲' },
];
<Select value={leagueId} options={leagues} onChange={setLeagueId} />
```

## 实际位置
`packages/ui/src/form.tsx`
