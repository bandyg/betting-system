# ErrorBoundary

顶层错误兜底 — React 18 class component。

## Props
| Prop | Type | 描述 |
|------|------|------|
| `children` | `ReactNode` | 包裹的内容 |

## State
```ts
{ hasError: boolean; msg: string; stack?: string }
```

## 渲染

错误时显示友好降级页：
- 💥 大图标 + "页面出错了" 标题
- 错误消息
- `<details>` 技术栈 (前 5 行)
- 🔄 重试（清除 error 状态重新渲染子树）
- 🏠 返回大厅（跳 /matches）
- ↻ 刷新页面（location.reload）

## 实际位置
`apps/web/src/components/ErrorBoundary.tsx`

## Sprint
Sprint 1 B1 (细粒度错误处理)