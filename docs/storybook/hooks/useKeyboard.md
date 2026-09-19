# useKeyboard

全局键盘快捷键 hook。

## 行为

- 监听 `window.keydown`
- 输入框聚焦时大部分快捷键不触发
- `Esc` 任何时候都生效（关闭 modal）

## 用法

```ts
const kbd = useKeyboardShortcuts();
// kbd.openHelp() / kbd.closeHelp() / kbd.helpOpen: boolean
```

## 注册的快捷键

| Key | Action |
|-----|--------|
| `?` (Shift+/) | 打开 KeyboardHelp |
| `/` | 聚焦 MatchesExplorer 搜索框 |
| `1` / `2` / `3` | 选第 N 个含数字的 `.odds-chip` |
| `Enter` | 投注单提交下注 |
| `Esc` | 关闭 modal / blur input |

## 实际位置
`apps/web/src/hooks/useKeyboard.ts`

## Sprint
Sprint 1 A4