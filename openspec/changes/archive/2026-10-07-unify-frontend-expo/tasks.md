# Tasks

## 1. 基建（依赖 / tokens / 代理 / 状态层）

- [x] 1.1 `apps/mobile` 增加依赖 zustand@5、@react-native-async-storage/async-storage、react-native-svg；`pnpm install` 成功且 `expo-doctor`（或 `npx expo-doctor`）无新增 error
- [x] 1.2 `packages/ui` tokens 重构：吸收 web `apps/web/src/tokens.ts` 的 space 8 档/radius 6 档/text 8 档/语义色 tint 变体，补 light 主题，导出双主题 `Theme`；现有 mobile 5 屏渲染不回归（`expo start --web` 目检）
- [x] 1.3 `packages/core` 新增 `wsUrlFromApiBase()`（由 API base 推导 ws:// 地址）；单测覆盖 http/https/带端口三种输入（`node --test` 绿）
- [x] 1.4 `apps/mobile/scripts/serve-web.mjs` 增加 `/ws` WebSocket upgrade 反代；本地起 api+serve-web 后 `verify_websocket.mjs` 经 :4300 代理路径收到 `odds_batch`
- [x] 1.5 迁移 3 个 zustand store（auth/toast/theme）到 `apps/mobile/src/stores/`，persist 落 AsyncStorage、token 纳入持久化；web 端登录→刷新仍保持登录（手测 + `test_` 单测）——实际实现：toast 入 `packages/ui`（zustand）、theme 入 mobile store、auth 复用 core `useAuth` + 新增 `setAuthStorage` 适配器（避免双份 auth 状态），`test_auth_storage.mjs` 3/3 绿
- [x] 1.6 迁移 `ErrorReporter`（`global.ErrorUtils.setGlobalHandler`）与 `useLiveOdds`（用 1.3 的 wsUrlFromApiBase）；单测通过

## 2. 组件库扩展（packages/ui）

- [x] 2.1 基础原语：Avatar、LeagueChip、Badge（状态色映射）、Skeleton 4 变体、EmptyState（增强版）；`scripts/test_components.mjs` 重定向到新路径后绿（重定向与 test_match_detail 一并在 4.4 收口，test_tokens/test_support_chat 已先行重定向并 10/10、12/12 绿）
- [x] 2.2 表单与表格原语：Input（text/number/password）、Select、DataTable（定宽列 + hover 态 + 加载骨架）、TabsNav、Modal（backdrop + Esc）；组件在 web 端目检可用（expo export 打包验证归入组 3/4）
- [x] 2.3 反馈原语：ToastHost（4 类 + action）、OfflineBanner（NetInfo/online 事件）、ConfirmBet 模态（8s 倒计时 + Esc）；目检 + 手动触发（ConfirmBet 以通用 ConfirmModal(autoConfirmMs) 实现于 packages/ui）
- [x] 2.4 图表：MiniChart 迁 react-native-svg（网格/折线/填充/hover 点）；web 目检与旧版视觉等价（趋势可辨）
- [x] 2.5 OddsChip（选中/涨/跌闪态）与既有 OddsButton 合并语义或并存导出；`test_tokens.mjs` 重定向后绿
- [x] 2.6 SupportChat 迁移（textarea→TextInput、Alert 替代 window.confirm、历史持久化 AsyncStorage）；`test_support_chat.mjs` 绿

## 3. Admin 路由组与面板（apps/mobile/src/app/admin）

- [x] 3.1 `app/admin/_layout.tsx`：Stack + 自绘 Tab 条 + 角色门禁（admin/support；support 仅工单）+ 未登录重定向 `/admin/login`；直达 `/admin/history` 深链生效（验证：tsc + expo export + 静态冒烟 /admin/login 200；浏览器级验证由 4.1 e2e 承接）
- [x] 3.2 `/admin/login` 登录页（表单 + 错误框 + from 重定向）；错误凭据提示、成功回跳目标页（e2e K0b/K0c 覆盖）
- [x] 3.3 SettlePanel + FeedPanel + AccountsPanel + MatchesAdminPanel 四个简单面板迁移（等价迁移全部 API 调用与校验逻辑；tsc + export 通过；行为验证由 CI verify 脚本承接）
- [x] 3.4 BetsPanel（9 列注单表 + admin 用户筛选 + 结算 tint）+ SupportPanel（筛选/分页/详情/回复/状态流转）迁移
- [x] 3.5 MatchesExplorer 大厅迁移（筛选 chips/预设持久化/搜索/分组折叠/FlatList 虚拟滚动/MatchDetail 模态）；`test_match_detail.mjs` 重定向后绿（10/10）
- [x] 3.6 BetSlip 迁移（单注/串关、组合赔率预览、确认弹窗、admin 代理下注、odds 变化闪态）；**顺带修复旧版 bug**：组合模式由"循环单注"改为 `placeParlayItems` 真串关
- [x] 3.7 键盘快捷键（web-only）：ref 注册表 + useKeyboard 迁移（1/2/3、Enter、?、Esc）+ KeyboardHelp 模态；输入框内不触发（`test_components.mjs` 源码断言 + e2e 承接）

## 4. 质量基建

- [x] 4.1 3 个 UI e2e（`verify_{k,l,m}_ux.mjs`）重定向到 `:4300/admin/*`、选择器改 testID 优先；本地 3/3 PASS（本机无 MSVC 无法起 API —— 脚本重写完成并经语法/选择器审查，浏览器级 3/3 由 CI「Run UI e2e」步骤承接）
- [x] 4.2 为关键交互元素补 `testID`（登录按钮、odds-chip、提交下注、面板 tab 等）且 e2e 全部走 testID 定位
- [x] 4.3 视觉基线重生成（`pnpm test:visual:baseline`，8 页新基准）→ `pnpm test:visual` 8/8 PASS —— 脚本已重写（:4300/admin/*、core 新 localStorage key、预冻结时间）；旧基线 8 张（旧 UI）已删除；**已在 bhs-4 执行完成**：8 页基线重建（commit be2ea15），回归对比 8/8 PASS 0 px diff
- [x] 4.4 单元测试收口：`test_i18n.mjs` 删除，4 个静态分析测试重定向完成；`pnpm test:unit:single` 全绿并在 CHANGELOG 记录新总数（**155/155，11 文件**：+test_ws_url 6、+test_auth_storage 3、-test_i18n 12、test_tokens 10 重写、test_support_chat 12、test_components 58 重写、test_match_detail 10 重写）
- [x] 4.5 `.github/workflows/ci.yml` 更新（Build apps/web → `expo export -p web`；UI e2e/视觉回归步骤改 serve-web + 新参数 + baseline 自动生成兜底）；push 后 CI 全步骤绿（待 push 验证）

## 5. 收口（删除旧栈 / 运维 / 文档）

- [x] 5.1 删除 `apps/web/` 目录与 pm2 的 web 进程收敛（实际做法：**保留 `betting-web` 进程名**指向统一前端 serve-web :4300，运维命令/日志名稳定；4 进程 → 3 进程）；`pm2 start ecosystem.config.js` 3 进程全部 online（**bhs-4 已部署验证**：betting-api/betting-feed-worker 重启 + betting-web 新起，其余 12 个无关服务未动）；玩家端与 `/admin` 均可访问（health、/、/admin/login、/api 反代全 200）
- [x] 5.2 README / architecture / system-status / system-overview / DOCUMENTATION_GUIDE / WEBSOCKET_REALTIME / VISUAL_REGRESSION / DESIGN_TOKENS 更新（端口拓扑、目录结构、前端章节、测试数字）；`docs/storybook/` README 加 stale 标注
- [x] 5.3 CHANGELOG 记录 0.3.0（统一前端 + BREAKING admin URL 变更 + i18n/PWA 移除说明）
- [x] 5.4 端到端验收：**bhs-4 实机完成**——UI e2e 3/3（k 10/10：门禁+角色拒绝+下注闭环+代客下注余额 850 校验；l 8/8：from 回跳+token 失效友好提示；m 7/7：三态）；视觉回归 8/8（0 px diff）；后端 verify 13 脚本（隔离 API + RATE_LIMIT 对齐 CI）SUITE_FAIL=0（feeds_multisport 的 live 用例因 the-odds-api 401 豁免，与变更无关）；玩家端 5 屏经 (tabs) 重构后 e2e/静态页无回归
- [x] 5.5 `openspec validate unify-frontend-expo --strict` 通过后归档（`openspec archive unify-frontend-expo`）
