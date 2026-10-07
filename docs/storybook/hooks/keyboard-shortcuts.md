# keyboard-shortcuts（admin 快捷键）

admin 侧全局快捷键：`KeyboardProvider` 挂一个 `window.keydown` 监听，通过 **ref 注册表**（而非 DOM 查询）把按键路由到组件回调；仅 web 生效。

## 功能

- **`KeyboardProvider`** — 用 `useRef` 持有两张注册表：
  - `oddsRef: Map<number, () => void>` — 可见赔率筹码，key 是序号（从 1 开始）。
  - `submitRef: (() => void) | null` — 「提交下注」回调（单槽，后注册覆盖）。
  - Provider 内部维护 `helpOpen` state，渲染 `KeyboardHelp` 帮助弹窗（`testID="kbd-help"`，列出全部快捷键）。
- **`useKeyboardRegistry()`** — 从 Context 取注册函数：
  - `registerOdds(order, cb)` → 返回反注册函数（`Map.delete(order)`）。
  - `registerSubmit(cb)` → 返回反注册函数（仅当仍是当前 cb 时置空，避免旧组件卸载时清掉新组件的注册）。
- **按键分发**（`useEffect` 内，仅 `Platform.OS === 'web'` 时挂 `window` keydown）：

| Key | 行为 |
|-----|------|
| `1` / `2` / `3` | 触发注册的第 N 个赔率筹码回调 |
| `Enter` | 触发提交下注回调 |
| `?`（Shift+/） | 切换帮助弹窗 |
| `Esc` | 关闭帮助弹窗（普通 Modal 自带 Esc 关闭，这里只兜底 help） |

- **输入保护**：`e.target` 是 `INPUT` / `TEXTAREA` / `SELECT` 或 `isContentEditable` 时直接 return——在输入框里打字不会触发快捷键。
- **卸载**：`cleanup` 移除 keydown 监听；各注册方在自己的 `useEffect` 里 return 反注册。

## 为什么用 ref 注册表而不是 DOM 查询

- 组件树里没有稳定的 DOM 锚点：赛实行在 `FlatList` 虚拟滚动下不常驻 DOM，赛事行/赔率筹码由 React 按状态重渲，靠 `querySelector('.odds-chip')` 取「第 N 个」既会漏掉未挂载行，也会取到已卸载的残影。
- 回调直连组件状态：注册的是闭包（直接 `onPick(...)`、`submit()`），不需要从 DOM 上反解 props，也就没有 props→DOM→props 的往返失真。
- O(1) 查找、天然去作用域：`Map.get(N)` / 单槽引用，unmount 即反注册，不存在监听器泄漏或选择器串号。
- 跨平台安全：React Native 没有 `window.document`；注册表在原生端只是两个 `useRef`，监听器在 `Platform.OS !== 'web'` 时不挂，同一份代码可留在原生包里。

## 消费方

- `apps/mobile/src/admin/panels/MatchesExplorer.tsx` — 把当前**前 3 个可见的 open 赔率**注册为 1/2/3，按下即 `onPick`（未登录 / 市场关闭会 toast 拦截）。
- `apps/mobile/src/admin/panels/BetSlip.tsx` — `registerSubmit(submit)`，Enter 等价于点「提交下注」。
- Provider 挂载点：`apps/mobile/src/app/admin/_layout.tsx`（admin 路由组根部，包住整个 Stack）。

## 实际位置

`apps/mobile/src/admin/keyboard.tsx` — `KeyboardProvider` / `useKeyboardRegistry` / `KeyboardHelp`
