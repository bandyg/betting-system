# ThemeToggle

暗/亮主题切换按钮。

## 存储
- `localStorage.theme` = `'dark' | 'light'`
- 默认跟系统 `prefers-color-scheme`

## 实现

- `initTheme()` 在 main.tsx 启动时调用
- 通过切换 body class + CSS variables (`--fg`, `--bg-card`, etc.)

## 用法
无需手动调用 — Header 已包含按钮

## 实际位置
- `apps/web/src/components/ThemeToggle.tsx`
- `apps/web/src/hooks/useTheme.ts`
- `apps/web/src/store.ts` (initTheme)