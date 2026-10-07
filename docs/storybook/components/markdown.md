# MarkdownText

轻量 Markdown 渲染组件：支持标题/粗斜体/行内代码/链接/列表/分隔线，零第三方依赖。

## Props

| Prop   | Type     | Default | 描述 |
|--------|----------|---------|------|
| `body` | `string` | —（必填） | 要渲染的 Markdown 文本 |

## 支持的语法

| 语法 | 示例 | 渲染 |
|------|------|------|
| 标题 | `# 标题` / `## 标题` / `### 标题` | h1 `fontSize.xl` / h2 `fontSize.lg` / h3 `fontSize.md`，粗体 |
| 粗体 | `**文字**` | `font.bold`（800），主文本色 |
| 斜体 | `*文字*` | `fontStyle: 'italic'` |
| 行内代码 | `` `code` `` | 等宽字体 + 青色 + 浅青底胶囊 |
| 链接 | `[文字](https://…)` | `t.secondary` 下划线，点击 `Linking.openURL` 打开 |
| 无序列表 | `- 项` 或 `* 项` | `•` 圆点（`t.secondary`）+ 正文 |
| 有序列表 | `1. 项` 或 `1) 项` | `N.` 编号（`t.secondary`）+ 正文 |
| 分隔线 | `---` 或 `***` | 1px 横线（`t.border`） |
| 段落 | 普通行 | `fontSize.md`、行高 24、`t.textSecondary`；连续非空行合并为一段 |

### 解析说明

- 按行切分：先识别标题 / 分隔线 / 列表项，其余累积成段落（空行分段）。
- 行内 token 用单一正则一次性切分：`**bold**`、`*italic*`、`` `code` ``、`[text](url)`。
- 链接打开失败静默忽略（`.catch(() => {})`）。
- 不支持图片、表格、代码块（```）、嵌套列表。

## 用法

```tsx
import { MarkdownText } from '@betting/ui';

<MarkdownText body={'## 活动规则\n\n1. 首存满 **100** 赠 *50*\n2. 流水要求 `x5`\n3. 详见 [条款](https://example.com/rules)\n\n---\n\n最终解释权归平台所有。'} />
```

## 实际位置
`packages/ui/src/markdown.tsx`
