# Table 表格与导航

泛型数据表 DataTable（含泛型 `Column`）与横向标签导航 TabsNav（`TabItem`）。

## DataTable

泛型表格：表头 + 行（斑马纹、hover 高亮、可选整行点击），加载态显示骨架屏，空数据显示 `EmptyState`。

### `Column<T>`

```ts
interface Column<T> {
  key: string;
  label: string;
  flex?: number;                          // 列宽权重（flex），默认 1
  align?: 'left' | 'center' | 'right';    // 对齐，默认 left
  width?: number;                          // 固定像素宽（与 flex 二选一）
  render?: (row: T) => React.ReactNode;    // 自定义单元格渲染
}
```

- 无 `render` 时，取 `row[key]` 转字符串展示。
- `align` 映射为 `justifyContent`：`right → flex-end`、`center → center`、其余默认。

### Props

| Prop           | Type                                 | Default    | 描述 |
|----------------|--------------------------------------|------------|------|
| `columns`      | `Column<T>[]`                        | —（必填）   | 列定义 |
| `rows`         | `T[]`                                | —（必填）   | 行数据 |
| `keyExtractor` | `(row: T, index: number) => string`  | —（必填）   | 行 key 提取（同时用于 `${testID ?? 'table'}-row-${key}`） |
| `loading`      | `boolean`                            | `false`    | `true` 时渲染 `SkeletonTable`（列数取 `min(columns.length, 6)`）而非表格 |
| `emptyText`    | `string`                             | `暂无数据`  | 空数据文案（渲染 `EmptyState`） |
| `onRowPress`   | `(row: T) => void`                   | —          | 整行点击回调；不传则行不可点 |
| `testID`       | `string`                             | —          | 表格测试 ID |

### 行为

- 空 `rows`（且非 loading）→ `EmptyState`；`loading` → 骨架屏，两者都跳过正常表格。
- 行 hover（web）→ `t.bgGlass` 背景；奇数行自带 `rgba(124,58,237,0.04)` 斑马纹。
- 表格整体：`radius.md` 圆角 + `t.border` 边框，内部 `ScrollView` 纵向滚动（带 fading edge）。

## TabsNav

横向滚动的胶囊标签导航（admin 顶部导航）。

### `TabItem`

```ts
interface TabItem {
  key: string;
  label: string;
  badge?: number | string;   // 右侧数字/文字角标
}
```

### Props

| Prop     | Type                 | Default      | 描述 |
|----------|----------------------|--------------|------|
| `tabs`   | `TabItem[]`          | —（必填）     | 标签列表 |
| `active` | `string`             | —（必填）     | 当前激活的 `key` |
| `onChange` | `(key: string) => void` | —（必填）  | 切换回调（传被点标签的 `key`） |
| `testID` | `string`             | `tabs-nav`   | 容器测试 ID（单个标签固定为 `tab-${key}`） |

### 行为

- 激活项：`t.secondary` 底 + 白字 + 同色边框；未激活：`t.bgElevated` 底 + `t.textSecondary` 字，按下短暂 `t.border` 底。
- `badge` 存在时在标签右侧渲染圆角小徽标（激活态白字 25% 白底，未激活 `t.secondary` 字 + `t.oddsActiveBg` 底）。
- 横向 `ScrollView`，隐藏滚动指示器。

## 用法

```tsx
import { DataTable, TabsNav, type Column, type TabItem } from '@betting/ui';

// DataTable
type Bet = { id: string; market: string; odds: number; state: string };
const columns: Column<Bet>[] = [
  { key: 'market', label: '玩法', flex: 2 },
  { key: 'odds', label: '赔率', align: 'right' },
  { key: 'state', label: '状态', align: 'center', render: (r) => <Badge status={r.state} /> },
];

<DataTable
  columns={columns}
  rows={bets}
  keyExtractor={(r) => r.id}
  loading={loading}
  emptyText="暂无投注"
  onRowPress={(r) => open(r)}
  testID="bets-table"
/>

// TabsNav
const tabs: TabItem[] = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '进行中', badge: 3 },
  { key: 'settled', label: '已结算' },
];
const [tab, setTab] = useState('all');
<TabsNav tabs={tabs} active={tab} onChange={setTab} />
```

## 实际位置
`packages/ui/src/table.tsx`
