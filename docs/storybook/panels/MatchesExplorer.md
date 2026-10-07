# MatchesExplorer

赛事大厅：多维筛选 + 分组折叠 + 预设持久化 + 虚拟滚动 + 实时赔率 + 详情弹窗。

## Props

| Prop | Type | 描述 |
|------|------|------|
| `onPick` | `(p: BasketPick) => void` | 选中赔率回调（由页面负责同市场互斥 / 同 key toggle 移除） |
| `pickedKeys` | `Set<string>` | 已选 key 集合，用于 OddsChip 的 `selected` 态 |

```ts
// BasketPick（导出类型）
{ key: string; marketId: number; matchLabel: string; marketLabel: string; selection: string; price: number }
// key = `${marketId}:${selection}`
```

## 功能

- **数据**：`api.listMatches()` 一次拉全量，`loadedAt` 记录「更新于 HH:mm」；`refresh` 手动刷新。
- **多维筛选**（全部作用于同一份 `matches`，`useMemo` 计算分组）：
  - 运动 pills：单选 `sport`（带计数，切换时清空联赛）+ 已选的多选 `sports[]`（pill 显示 `✕` 可移除，多选时优先于单选）
  - 队名搜索 `q`（`home + away` 小写包含）
  - 联赛：`leagueQ` 输入先过滤联赛选项，再 `Select` 选中 `league`
  - 状态 chips：全部 / 未开始 / 进行中 / 已结束 / 已结算
  - 时间 chips：今天 / 近3天 / 近7天（以**本地日 0 点**为起点，`kickoff_time` 落在 `[start, start + days*86400000)` 才保留）
  - `✅ 仅开盘`：要求至少有一个 `status === 'open'` 且 `odds.length > 0` 的市场
- **Active filter chips**：有任一筛选生效时逐条展示（每条点击即移除），末尾「全部清除」（`clearAll` 同时清 `leagueQ`）。
- **统计行**：总场次、`🔴 N 进行中`（`in_progress`/`open`）、更新时间。
- **分组折叠**：按 `sport||league` 分组（无联赛归「未分类联赛」），组按运动名、联赛名排序；组头 `▼/▶` + `sportLabel`（emoji + 名称）+ `LeagueChip`；折叠状态存 `collapsed: Record<string, boolean>`。
- **筛选预设（AsyncStorage 持久化）**：键 `mexplorer.presets`。
  - `snapshot()` 把 `{ q, sport, sports, league, status, when, onlyWithOdds }` 序列化
  - 保存：输入名字 + 回车/保存按钮，同名覆盖，toast 提示
  - 加载：`loadPreset(filter)` 解析 JSON 回填各 state，解析失败 toast 错误
  - 删除：预设 pill 右侧 `✕`；增删改都立即写回 AsyncStorage
- **虚拟滚动**：展开分组后的 `flatMatches.length > 40`（`VIRTUAL_THRESHOLD`）时切换为 `FlatList`，`ROW_H = 96` 固定行高 + `getItemLayout` 免测量；顶部显示「共 N 场（虚拟滚动中）」。**虚拟态渲染精简卡片行（不含赔率 chips）**；`≤ 40` 时走 `ScrollView` + 分组卡片 + 完整赔率行。
- **实时赔率**：`useLiveOdds(callback)` 收到 `odds_batch` 后按 `marketId` 定位市场、按 `selection` 覆盖 `price`；价格变化的筹码记入 `liveFlashes`（`up`/`down`）并在 1.2s 后清除，传给 `OddsChip` 的 `flash`。
- **快捷键接线**：取「当前可见的前 3 个 open 赔率」注册进 `useKeyboardRegistry().registerOdds(1..3)`，按 `1/2/3` 等价于点击；未登录或市场已关闭时 toast 拦截。`useEffect` 依赖 `visibleOdds`，折叠/虚拟切换会重新注册并反注册旧的。
- **详情弹窗**：点队伍名 → `setDetailMatch(m)` 打开 `MatchDetail`；`onPick` 复用 `handlePickChip`（同样的登录/市场校验）。
- **空态 / 加载态**：加载 `SkeletonList(4)`；无结果 `EmptyState` 带「重置筛选」按钮。
- `FilterChip` 是面板内部的轻量筛选 pill（`OddsChip` 面向赔率，不适合纯筛选场景）。

## 主要 state

```ts
matches / q / sport / sports[] / league / leagueQ / status / when / onlyWithOdds
presets[] / presetName / collapsed{} / loadedAt / loading
detailMatch / liveFlashes{}
```

## 实际位置

- 组件：`apps/mobile/src/admin/panels/MatchesExplorer.tsx`
- 挂载路由：`apps/mobile/src/app/admin/matches.tsx`（`/admin/matches`，≥1100px 双栏、窄屏单栏）
- 实时赔率：`packages/core/src/hooks.ts` 的 `useLiveOdds`
- 详情弹窗：`apps/mobile/src/admin/MatchDetail.tsx`
