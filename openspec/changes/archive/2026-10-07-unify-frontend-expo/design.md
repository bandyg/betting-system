# Design

## Context

`apps/mobile`（Expo SDK 57 / React 19.2 / TS 6 / expo-router Tabs，5 屏玩家端）为统一宿主；`apps/web`（React 18.3 / Vite 6 / react-router v6 / zustand 4 / 856 行 CSS / 4842 行）待迁移后删除。`packages/ui` 已是 RN 实现（Card/Button/OddsButton 等 10 组件 + dark-only tokens），`packages/core` API client 已原生就绪（`setApiBase`）但缺 WS 地址推导。`apps/mobile/scripts/serve-web.mjs` 已实现静态托管 + `/api` 反代，缺 `/ws`。盘点确认：web 的 `src/api.ts`/`types.ts`/`useApi.ts` 为死代码；i18n 字典（96 键×2 语言）基本未接线（仅语言切换标签使用）；JWT token 未持久化（刷新即丢）；5 个单元测试文件静态分析 `apps/web/src` 源文件路径。

## Goals / Non-Goals

**Goals:**

- 一份 Expo 工程、一份 Web 构建产物、一个服务进程承载玩家端 + 管理后台
- 后台 8 面板功能等价迁移（允许视觉细节因 RN-Web 渲染差异而不同，不允许功能缺失）
- 组件与 tokens 收敛到 `packages/ui` 单一来源，双主题
- 既有质量基建延续：3 个 UI e2e、8 页视觉回归、148 单元测试全绿（重定向/重生成后）

**Non-Goals:**

- 不新增业务功能、不改 `apps/api` 任何 endpoint
- 不做全量 i18n（roadmap 已列为范围外；随迁移丢弃未接线字典与语言切换）
- 不重写玩家端现有 5 屏
- 不追求与旧 Vite 版像素级一致（视觉基线重新生成，等价而非相同）

## Decisions

### Decision: admin 并入 `apps/mobile` 作 `app/admin/` 路由组（单 app，非第二个 Expo 工程）

备选是"两个 Expo app"（保持 :4200/:4300 双端口）。否决：两份工程仍要维护两份依赖与构建，违背统一初衷。采用 expo-router 路径段 `app/admin/**`（URL 前缀 `/admin`），后台用 Stack 自带 header + 自绘 Tab 条（不复用玩家端底部 Tabs）；玩家端路由保持根路径不变。

### Decision: 版本基线跟随 mobile（React 19 / TS 6），状态层 zustand@5 + AsyncStorage 持久化

zustand 4 不支持 React 19；zustand@5 在 RN 下以 `@react-native-async-storage/async-storage` 作 persist storage（web 端该库自动落 localStorage）。迁移时把 JWT token 纳入 `useAuth` 持久化（partialize 加 token），启动恢复顺序：restore token → restoreSession，修复刷新掉登录的既有 bug。

### Decision: 16 个 web 组件全部迁入 `packages/ui`（而非 mobile 本地）

后台原语（表格/模态/徽章…）对玩家端同样可复用（OddsChip↔OddsButton 已存在则合并语义）。tokens 重构以 `packages/ui` 现有 tokens 为基，吸收 web `tokens.ts` 的尺寸梯度（space 8 档/radius 6 档/text 8 档）与语义色 tint 变体，补 light 主题（现 dark-only），导出 `useTheme` 消费。旧 web `tokens.ts` 与 CSS 变量体系随 `apps/web` 一起消亡，满足"单一来源"。

### Decision: CSS 能力映射固定为 —— StyleSheet + useWindowDimensions + reanimated + react-native-svg + FlatList

- 布局：CSS Grid（`.grid` 双列、`.lobby-layout` 1fr+380px）→ Flexbox + `useWindowDimensions` 断点（1100/900/600，对应 web 既有断点）
- 伪类态（hover/active/disabled）→ `Pressable` style 函数 + props
- keyframes（7 个动画）→ reanimated（已是依赖）；渐变 → expo-linear-gradient（已有）
- `<table>` → 自绘 `DataTable`（FlatList 行 + 列宽数组），`tr:hover` → hover 态样式函数（web）
- 虚拟滚动 `useVirtualScroll` → FlatList `getItemLayout`（原实现本就假设 96px 定高）
- MiniChart SVG → react-native-svg（新增依赖，web/native 双端）
- `datetime-local`/`number` 输入 → web 用原生 input（RN-Web 支持 keyboardType），日期用文本 ISO 输入 + 校验（MVP 已有先例），不引入日期选择器依赖
- `toLocaleString('zh-CN')` → 轻量格式化函数（Web 端 Intl 可用；native 端 Hermes Intl polyfill 列为后续项，不阻塞本次）

### Decision: 键盘快捷键 web-only，用 ref 注册表替代 DOM 查询

旧实现靠 `document.querySelectorAll + .click()`，不可移植。新实现：odds-chip 注册 ref 到上下文注册表，快捷键 hook（`Platform.OS === 'web'` 才激活）从注册表取目标调回调。功能面不变（1/2/3、Enter、?、Esc）。

### Decision: `serve-web.mjs` 增加 `/ws` 反代；端口拓扑收敛为 :4100(API) + :4300(Web)

静态服务器监听 `server.on('upgrade')`，按 `Upgrade: websocket` 头把 `/ws/*` 管道转发到 API_TARGET 的对应 host:port。pm2 删除 `betting-web`（4→3 进程）。**BREAKING**：后台 URL `:4200` → `:4300/admin`。回滚策略：迁移以新增文件为主，最后一个任务才删 `apps/web` 与 pm2 条目；出问题可 revert 该 commit 恢复双端。

### Decision: e2e 与视觉基线随迁移重做（选择器 testID 优先）

RN-Web 产物的 DOM 类名（`rnr-*`/内联样式）不稳定，Playwright 选择器改为优先 `[data-testid]`（RN `testID` 在 web 端渲染为该属性）。3 个 e2e 脚本目标 URL 改 `:4300/admin/*`；8 张视觉基线重新生成（`pnpm test:visual:baseline`），对比逻辑不变。4 个静态分析 `apps/web/src` 的单元测试重定向到 `packages/ui`/`apps/mobile/src` 新路径；`test_i18n.mjs` 随 i18n 丢弃删除，148 总数相应核减并在 CHANGELOG 说明。

## Risks / Trade-offs

- [RN-Web 还原度：数据密集后台（9 列注单表、多栏 admin grid）在 RN 布局下密度/对齐可能劣化] → 以功能等价为验收标准；视觉基线重生成即新基准；e2e 兜底关键路径
- [4842 行重写引入行为回归] → 迁移顺序按"基建→组件→面板→大厅/投注单（最复杂，467+324 行）"推进；每完成一组跑既有 verify 脚本；e2e 3 条 + 视觉 8 页全绿为收口门槛
- [Playwright 对 RN-Web 交互（Pressable 合成事件）兼容性] → RN-Web 的 onClick 即原生 click，k_ux 已验证过 mobile web 可被 Playwright 驱动；新增交互若失败退回 `page.$eval` 派发原生事件
- [serve-web.mjs 手写代理的 WS 帧处理缺陷] → 反代仅做管道转发（不解析帧），风险低；`verify_websocket.mjs` 补一条经 :4300 代理路径的用例
- [zustand@5 + persist 在 RN 的兼容] → zustand 官方支持；AsyncStorage web 端自动用 localStorage，行为与旧版一致
- [移动打包体积增大（后台代码进 bundle）] → expo-router web 端按路由代码分割；native 端 MVP 不敏感，列观察项

## Migration Plan

1. 基建先行（依赖、tokens、serve-web /ws、stores）——纯新增，不影响现网
2. 组件库扩展 → admin 路由组骨架 + 登录 → 8 面板由简到繁（Settle/Feed/Accounts/MatchesAdmin → Bets/Support → Lobby+BetSlip）
3. 质量基建重做（e2e 重定向 + 基线重生成 + CI）并全绿
4. 收口：删 `apps/web`、pm2 减进程、docs/CHANGELOG 更新
5. 回滚：任一阶段失败可停在"双端并存"（新增文件不影响旧 :4200），仅最后删除步骤不可逆（git 历史可恢复）

## Open Questions

- `docs/storybook/` 的 16 份组件 Markdown 文档是否随组件迁库后逐份更新，还是标记 stale 待下次统一重写（不影响规格与任务结构，收口阶段按工作量裁量）
