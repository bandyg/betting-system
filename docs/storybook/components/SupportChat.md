# SupportChat

右下角浮动客服组件 — FAQ 机器人回复 + 快捷问题 + 本地历史持久化。

## Props

| Prop | Type | Default | 描述 |
|------|------|---------|------|
| `userName` | `string \| null` | — | 输入框 placeholder 前缀：传入显示「张三, 输入问题...」，不传显示「输入问题...」 |

## 用法

```tsx
import { SupportChat } from '@betting/ui';

// 挂在应用根部（自身是绝对定位浮层）
<SupportChat userName={user?.name} />
```

## 功能

- **FAB**：右下角 52px 圆形 💬 按钮（`size.fabSize`），点击开合面板；关闭期间收到助手回复时显示红色未读角标。
- **面板**：尺寸 `min(360, 屏宽-32) × min(540, 屏高-120)`（`size.supportW/H`），头部含助手头像、在线状态、🗑 清空（Alert 二次确认）、✕ 关闭。
- **FAQ bot**：12 组关键词匹配回复（下注/结算/登录/余额/联赛/组合/离线/主题/快捷键/bug/admin/工单），600–1200ms 随机延迟模拟输入；未命中走兜底话术（引导快捷问题或提工单）。
- **快捷问题**：6 个（如何下注?/结算怎么算?/组合模式怎么用?/快捷键有哪些?/报错怎么看?/怎么提工单?），点击填入输入框；仅在只有开场白时显示。
- **输入**：multiline、`maxLength 500`，回车发送（web 端 Shift+回车换行不发送）；内容为空时发送按钮禁用。
- **持久化**：AsyncStorage key `supportchat.messages`，保存最近 50 条，启动时恢复。
- 底部提示行：「回车发送 · 历史保存在本地」（web 端文案附「· ESC 关闭」）。

## 实现原理

- 状态自包含（open / messages / input / unread），无外部 store；机器人回复由 `detectReply(text)` 关键词顺序匹配得出。
- 用户消息靠右高亮（`oddsActiveBg`），助手消息靠左 + `Avatar` 头像（name="Bot"），每条带 `HH:mm` 时间戳。
- 关键 `testID`：`support-fab`、`support-panel`、`support-input`、`support-send`、`support-clear`、`support-close`、`support-quick-*`。

## 实际位置
`packages/ui/src/supportChat.tsx`
