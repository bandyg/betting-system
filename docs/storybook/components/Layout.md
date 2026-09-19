# Layout

全局 layout shell — header + tabs + main + modals。

## 结构

```tsx
<>
  <header className="top">
    <Logo /> <UserAvatar /> <LangToggle /> <KbdHelp /> <LoginBar /> <ThemeToggle />
  </header>
  <OfflineBanner />
  <Tabs />
  <main><Outlet /></main>
  <ToastHost />
  <KeyboardHelp />
  <SupportChat />
</>
```

## 实际位置
`apps/web/src/components/Layout.tsx` (45 行)

## 子组件
- `OfflineBanner` (B5)
- `SupportChat` (C4)
- `KeyboardHelp` + `useKeyboardShortcuts` (A4)
- `ToastHost`