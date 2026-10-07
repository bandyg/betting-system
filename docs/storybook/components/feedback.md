# Feedback 反馈组件

全局反馈设施：OfflineBanner（离线/恢复横幅，全局单例）与 ErrorBoundary（应用根级渲染错误兜底）。

## OfflineBanner

离线/恢复横幅。基于 `@react-native-community/netinfo` 订阅（web 端内部走 `navigator.onLine`）。

### Props

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| —    | —    | —       | 无 props（不接收任何参数） |

### 行为

- **全局单例**：应在应用根部挂载**一次**（放在 `Screen`/页面之外的顶层），多个实例会各自订阅、重复显示。
- 首帧网络状态未知（`online === null`）时不渲染。
- 断网时：红色横幅「⚠ 网络已断开，显示的可能是过期数据」。
- 由断网恢复时：绿色横幅「✓ 连接已恢复」显示 2.5s 后自动淡出。
- 进出场均为 reanimated 动画（`FadeInDown` / `FadeOutUp`，200ms）。
- `testID` 固定为 `offline-banner`。

## ErrorBoundary

React 错误边界类组件，渲染出错时展示兜底 UI（应用根级使用）。

### Props

| Prop       | Type              | Default   | 描述 |
|------------|-------------------|-----------|------|
| `children` | `React.ReactNode` | —（必填）  | 被包裹的子树 |

### 行为

- `getDerivedStateFromError` 捕获错误，正常渲染时原样返回 `children`。
- 出错时显示全屏兜底：💥 + 「页面出错了」+ 错误信息文本（内置暗色配色，不依赖主题上下文）。
- web 端额外显示「刷新页面」按钮（`window.location.reload()`，`testID="error-reload"`）；原生端不显示。
- `componentDidCatch` 仅在 web 打 `console.error`；错误上报交给全局 `errorReporter` 处理，这里只兜 UI。

## 用法

```tsx
import { OfflineBanner, ErrorBoundary } from '@betting/ui';

// 应用根部：ErrorBoundary 包住整棵树，OfflineBanner 作为全局单例挂一次
<ErrorBoundary>
  <OfflineBanner />
  <App />
</ErrorBoundary>
```

## 实际位置
`packages/ui/src/feedback.tsx`
