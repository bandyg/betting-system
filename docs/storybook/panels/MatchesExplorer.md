# MatchesExplorer

赛事大厅 — 智能筛选 + 虚拟滚动 + 联赛 chip + 详情 modal。

## 功能

- **搜索框**: 队名 fuzzy match
- **Sport multi-select**: chips 多选 (#6 LeagueChip)
- **联赛搜索 input**: 过滤 dropdown (#6 A6)
- **状态筛选**: scheduled/live/finished/settled
- **时间筛选**: today/3d/7d
- **"仅开盘" toggle**: 隐藏无 odds 赛事
- **Active filter chips**: 可点击移除
- **保存预设**: localStorage 命名 + 加载 + 删除
- **虚拟滚动**: ≥40 项时启用 (#2)
- **赛事详情**: 点击队伍名 → MatchDetail modal (A2)
- **赔率闪动**: 价格变化 1.2s 绿/红 (#A5)

## 状态

```ts
const [matches, setMatches] = useState<Match[]>([]);
const [q, setQ] = useState('');
const [sport, setSport] = useState('');
const [sports, setSports] = useState<string[]>([]);     // multi
const [league, setLeague] = useState('');
const [leagueQ, setLeagueQ] = useState('');
const [status, setStatus] = useState('');
const [when, setWhen] = useState<'all' | 'today' | '3d' | '7d'>('all');
const [onlyWithOdds, setOnlyWithOdds] = useState(false);
const [presets, setPresets] = useState<...>([]);
const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
const [detailMatch, setDetailMatch] = useState<Match | null>(null);
```

## 实际位置
`apps/web/src/panels/MatchesExplorer.tsx` (~415 行)

## Sprint
Sprint 2 A2 + A6 + Sprint 3 #2 #6 #A5