# Design Tokens — 设计系统

> Sprint 5 C5 — 设计系统 token 化

Betting Admin 的所有 UI tokens 集中定义，便于跨平台/跨组件一致 + 暗亮主题切换 + 可扩展。

## 文件位置

| 类型 | 文件 | 说明 |
|------|------|------|
| **CSS 变量** | `apps/web/src/styles/reset.css` | 浏览器实际生效的 token |
| **TS 镜像** | `apps/web/src/tokens.ts` | 类型安全 + Storybook 用 |
| **Storybook 文档** | `docs/storybook/components/` | 组件级 + token 展示 |
| **本文件** | `docs/DESIGN_TOKENS.md` | 完整 token 字典 |

## Token 类别

### 1. 间距 (Spacing)

4px 网格系统：

| Token | Value | 用途示例 |
|-------|-------|----------|
| `--space-1` | 4px | 紧凑图标间距 |
| `--space-2` | 8px | chip 内 padding, 小 gap |
| `--space-3` | 12px | 卡片内 padding, 中等 gap |
| `--space-4` | 16px | 主区块 padding, 表单间距 |
| `--space-5` | 24px | 大区块间距, header padding |
| `--space-6` | 32px | section 间距 |
| `--space-7` | 48px | 页面 margin |
| `--space-8` | 64px | 大间距 |

### 2. 圆角 (Radius)

| Token | Value | 用途示例 |
|-------|-------|----------|
| `--radius-sm` | 4px | 小 chip, input |
| `--radius-md` | 6px | 按钮, 卡片 |
| `--radius-lg` | 10px | 较大卡片, modal |
| `--radius-xl` | 14px | 大卡片, banner |
| `--radius-2xl` | 18px | 超大圆角 |
| `--radius-full` | 9999px | 圆形 (avatar, fab) |

### 3. 字号 (Font Sizes)

| Token | Value | 用途示例 |
|-------|-------|----------|
| `--text-xs` | 10px | 微小提示, badge |
| `--text-sm` | 12px | muted 标签, 副文本 |
| `--text-md` | 13px | 标准 UI 文本 |
| `--text-base` | 14px | 正文 |
| `--text-lg` | 16px | 副标题 |
| `--text-xl` | 18px | h2 |
| `--text-2xl` | 20px | h1 |
| `--text-3xl` | 28px | storybook h1 |

### 4. 字重 (Font Weights)

| Token | Value |
|-------|-------|
| `--fw-normal` | 400 |
| `--fw-medium` | 500 |
| `--fw-semibold` | 600 |
| `--fw-bold` | 700 |

### 5. 阴影 (Shadows)

| Token | Value | 用途 |
|-------|-------|------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.15)` | tooltip |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,0.3)` | 卡片默认 |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.3)` | 浮动按钮, dropdown |
| `--shadow-xl` | `0 12px 32px rgba(0,0,0,0.4)` | modal, panel |

### 6. 动画 (Animation)

| Token | Value | 用途 |
|-------|-------|------|
| `--duration-fast` | `0.1s` | hover |
| `--duration-normal` | `0.2s` | 主题切换, 状态变化 |
| `--duration-slow` | `0.4s` | modal 进出 |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 进入动画 |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | 通用 |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 弹性动画 |

### 7. Z-Index Scale

| Token | Value | 用途 |
|-------|-------|------|
| `--z-base` | 1 | 默认 |
| `--z-dropdown` | 10 | 下拉菜单 |
| `--z-sticky` | 50 | sticky header |
| `--z-fab` | 100 | 浮动按钮 (SupportChat) |
| `--z-offline` | 100 | OfflineBanner |
| `--z-confirm` | 200 | ConfirmBet modal |
| `--z-toast` | 999 | ToastHost |
| `--z-modal` | 1000 | MatchDetail modal |
| `--z-help` | 10000 | KeyboardHelp |

### 8. 组件尺寸 (Component Sizes)

| Token | Value | 用途 |
|-------|-------|------|
| `--header-h` | 60px | header.top 高度 |
| `--bet-slip-w` | 380px | BetSlip 右栏宽 |
| `--fab-size` | 52px | 浮动按钮直径 |
| `--support-w` | 360px | SupportChat panel 宽 |
| `--support-h` | 540px | SupportChat panel 高 |

### 9. 颜色 (Colors)

#### Dark (默认)

| Token | Value | 用途 |
|-------|-------|------|
| `--bg` | `#0f1420` | 页面底色 |
| `--bg-card` | `#171e30` | 卡片底 |
| `--bg-card-2` | `#1d2539` | 次级卡片 |
| `--bg-elevated` | `#1d2539` | 浮起元素 |
| `--border` | `#26304d` | 默认边框 |
| `--border-strong` | `#2a3350` | 强调边框 |
| `--fg` | `#e8ecf4` | 主文本 |
| `--fg-muted` | `#6b7699` | 次要文本 |
| `--fg-subtle` | `#8b95b5` | 更弱 |
| `--accent` | `#4a6cf7` | 主色 (按钮/链接) |
| `--accent-hover` | `#3a5ef0` | hover |
| `--accent-bg` | `rgba(74,108,247,0.15)` | accent 浅底 |
| `--accent-border` | `rgba(74,108,247,0.4)` | accent 边框 |
| `--success` | `#7ee2a8` | 成功 (绿) |
| `--success-bg` | `#12331f` | 成功浅底 |
| `--success-border` | `#1f6b3d` | 成功浅边 |
| `--danger` | `#ff9db0` | 失败 (红) |
| `--danger-bg` | `#33131a` | 失败浅底 |
| `--danger-border` | `#8a2f3f` | 失败浅边 |
| `--warning` | `#ffe07c` | 警告 (黄) |
| `--warning-bg` | `#3a3a12` | 警告浅底 |
| `--warning-border` | `#6b5b1f` | 警告浅边 |
| `--info` | `#7cc0ff` | 提示 (蓝) |
| `--info-bg` | `#12335a` | 提示浅底 |
| `--info-border` | `#2a4bd7` | 提示浅边 |

#### Light (via `[data-theme="light"]`)

| Token | Value |
|-------|-------|
| `--bg` | `#f7f8fc` |
| `--bg-card` | `#ffffff` |
| `--bg-card-2` | `#f0f3fa` |
| `--border` | `#d8def0` |
| `--fg` | `#1a1f30` |
| `--accent` | `#3a5bd7` |
| `--success` | `#1a8a4a` |
| ... | (亮色调，参考 reset.css) |

## 用法

### CSS
```css
.my-button {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--accent);
  color: white;
  font-size: var(--text-md);
  box-shadow: var(--shadow-md);
  transition: all var(--duration-fast) var(--ease-out);
}
```

### TypeScript
```ts
import { tokens } from './tokens.js';

const button = {
  padding: `${tokens.space[3]}px ${tokens.space[4]}px`,
  radius: tokens.radius.md,
  color: tokens.dark.accent,
};
```

## 设计原则

1. **8/4 网格**: 间距 4px 或 8px 倍数
2. **Type scale ratio**: 1.125 (8/9/10/11/12/13/14/16/18/20/28)
3. **圆角中等**: 6px 是默认 (不夸张也不锐利)
4. **阴影柔和**: dark theme 透明度低 (0.3) 让背景透出
5. **动画短**: 0.1-0.2s 是大多数, modal 用 0.4s
6. **z-index 数量化**: 不用 9999, 用语义化 token

## 与 packages/ui 关系

`packages/ui/src/tokens.ts` (mobile 用) 独立维护 — React Native 用 `theme.tsx` 而非 CSS 变量。**两份独立维护, 改一边手动同步另一边**。

未来:
- C7 单元测试可以加 tokens 完整性测试 (断言所有 token 在两处一致)
- 提取到 packages/design-tokens 共享 (待 packages/ui 重构)

## Sprint
Sprint 5 C5 — 设计系统 tokens 化