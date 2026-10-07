# Theme 主题系统

双主题（dark / light）Provider 与统一设计 tokens：`tokens.ts` 是颜色、间距、字号、动效等的单一来源，组件通过 `useTheme()` 取当前调色板，切换主题时全组件无感换色。

## ThemeProvider

### Props

| Prop           | Type                  | Default | 描述 |
|----------------|-----------------------|---------|------|
| `children`     | `React.ReactNode`     | —（必填） | 子树 |
| `mode`         | `ThemeMode`（`'dark' \| 'light'`） | —  | 受控主题模式；不传则内部持有状态，默认 `dark`（玩家端既有行为不变） |
| `onModeChange` | `(m: ThemeMode) => void` | —    | 模式变化回调（宿主接自己的持久化 store 用） |

## Hooks

### `useTheme(): Theme`

取当前调色板（即 `colors` 或 `lightColors`，同键同形状），组件内消费颜色：

```tsx
const t = useTheme();
<View style={{ backgroundColor: t.bgElevated, borderColor: t.border }}>
  <Text style={{ color: t.text }}>{t.textSecondary}</Text>
</View>
```

### `useThemeMode(): { palette, mode, setMode }`

取/切主题模式（admin 主题切换用）：

```tsx
const { palette, mode, setMode } = useThemeMode();
setMode(mode === 'dark' ? 'light' : 'dark');
```

受控模式下 `setMode` 只触发 `onModeChange`（状态由宿主持有）；非受控时更新内部 state 并回调。

## tokens 概览（`packages/ui/src/tokens.ts`）

所有导出均从 `@betting/ui` 直接引入，是唯一权威定义（原 `apps/web/src/tokens.ts` 已并入）。

### colors / lightColors —— 双主题调色板

`colors`（dark，`as const`）与 `lightColors`（同键映射，类型 `Theme`）键完全一致；`themes = { dark: colors, light: lightColors }`，`ThemeMode = keyof typeof themes`。

| 键组 | 键 | 说明 |
|------|----|------|
| 主色 | `primary`（紫）、`secondary`（青）、`accent`（粉点缀） | dark `#7C3AED` / `#06B6D4` / `#F472B6`，light 换深一号 |
| 渐变 | `gradientStart`、`gradientEnd` | Button gradient 变体用 |
| 背景层级 | `bg`（页面底）、`bgElevated`（卡片底）、`bgGlass`（玻璃拟态，半透明） | dark `#0B0F1A` / `#131A2E`；light `#F7F8FC` / `#FFFFFF` |
| 边框 | `border`（弱）、`borderStrong`（强） | 半透明色 |
| 文本 | `text`、`textSecondary`、`textMuted` | 三级文本 |
| 功能色 | `success`（升/赢）、`danger`（降/输）、`warning`、`info` | 语义色 |
| 赔率 | `oddsBg`、`oddsBorder`、`oddsActiveBg`、`oddsActiveBorder` | 赔率筹码/按钮 |

### 其余 tokens

| token | 内容 | 备注 |
|-------|------|------|
| `space` | `1:4 2:8 3:12 4:16 5:24 6:32 7:48 8:64` | 8 档间距梯度（4px 网格），web 并入 |
| `radius` | `sm:8 md:12 lg:16 xl:24 '2xl':18 pill:999` | 圆角 |
| `fontSize` | `xs:11 sm:13 md:15 lg:17 xl:20 xxl:28 hero:40` | 字号 |
| `fw` | `normal:400 medium:500 semibold:600 bold:700` | 字重（数字形式，admin 表格用） |
| `duration` | `fast:100 normal:200 slow:400` | 动效时长，**毫秒数** |
| `ease` | `out:[0.16,1,0.3,1]`、`inOut:[0.4,0,0.2,1]`、`spring:[0.34,1.56,0.64,1]` | 缓动**贝塞尔控制点数组** `[x1,y1,x2,y2]`，配合 `Easing.bezier(...v)` 供 RN 动画直接消费 |
| `z` | `base:1 dropdown:10 sticky:50 fab:100 toast:999 modal:1000 help:10000` | 层级 |
| `size` | `headerH:60 betSlipW:380 fabSize:52 supportW:360 supportH:540` | 组件尺寸 |
| `statusTone` | `Record<string, 'info'\|'success'\|'warning'\|'neutral'>` | 状态徽章语义分组（Badge 用），取色随主题自动切换 |

> 另有历史兼容的 `spacing`（xs~xxl）、`font`（regular `'600'` / medium `'500'` / bold `'800'` 字符串字重）与 `shadows`（card / glow）一并从包根导出。

## 单一来源与切换方式

- 单一来源：颜色与尺度只定义在 `tokens.ts`；组件不写死颜色，一律经 `useTheme()` 读当前调色板，保证 dark/light 同键切换。
- 切换方式一（非受控）：应用根部包 `<ThemeProvider>`，任意位置 `useThemeMode().setMode('light')`，默认 `dark`。
- 切换方式二（受控）：宿主持有持久化状态，`<ThemeProvider mode={mode} onModeChange={save}>`，Provider 仅按 `mode` 选 `colors` / `lightColors`。

## 用法

```tsx
import { ThemeProvider, useTheme, useThemeMode, colors, space, radius, duration, ease } from '@betting/ui';

// 应用根部
<ThemeProvider>
  <App />
</ThemeProvider>

// 受控（宿主持久化）
<ThemeProvider mode={mode} onModeChange={(m) => AsyncStorage.setItem('theme', m)}>
  <App />
</ThemeProvider>

// 组件内取消费调色板
function Header() {
  const t = useTheme();
  return <View style={{ backgroundColor: t.bg, borderColor: t.border }} />;
}

// 主题切换按钮
function ThemeToggle() {
  const { mode, setMode } = useThemeMode();
  return <Button title={mode === 'dark' ? '亮色' : '暗色'} onPress={() => setMode(mode === 'dark' ? 'light' : 'dark')} />;
}

// 直接使用 tokens
const cardStyle = { padding: space[4], borderRadius: radius.lg };
// withTiming(v, { duration: duration.normal, easing: Easing.bezier(...ease.out) })
```

## 实际位置
- `packages/ui/src/theme.tsx`（ThemeProvider、useTheme、useThemeMode）
- `packages/ui/src/tokens.ts`（colors / lightColors / themes / space / radius / fontSize / fw / duration / ease / z / size / statusTone 等）
