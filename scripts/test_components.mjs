// scripts/test_components.mjs — 组件关键源码断言（unify-frontend-expo 重写，指向 packages/ui + apps/mobile/src/admin）
//
// 验证关键功能在源码中存在 (regression test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function readSrc(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

// ── Avatar / LeagueChip / Badge（packages/ui/src/primitives.tsx）──
const primSrc = readSrc('packages/ui/src/primitives.tsx');
test('Avatar: hashHue 函数', () => assert.match(primSrc, /function hashHue/));
test('Avatar: HSL 颜色生成', () => assert.match(primSrc, /hsl\(\$\{hue\}/));
test('Avatar: 无 src 时渲染首字', () => assert.match(primSrc, /toUpperCase\(\)/));
test('Avatar: 接受 size prop', () => assert.match(primSrc, /size = 32/));
test('LeagueChip: hashHue 使用', () => assert.match(primSrc, /const hue = hashHue\(league/));
test('LeagueChip: sport emoji 推算', () => assert.match(primSrc, /SPORT_EMOJI/));
test('LeagueChip: size variants xs/sm/md', () => assert.match(primSrc, /size\?: 'xs' \| 'sm' \| 'md'/));
test('Badge: statusTone 语义取色', () => assert.match(primSrc, /statusTone\[status\]/));

// ── MiniChart（packages/ui/src/chart.tsx，react-native-svg）──
const chartSrc = readSrc('packages/ui/src/chart.tsx');
test('MiniChart: SVG 折线 path', () => assert.match(chartSrc, /<Path d=/));
test('MiniChart: 渐变填充', () => assert.match(chartSrc, /<LinearGradient/));
test('MiniChart: 空数据处理', () => assert.match(chartSrc, /暂无走势/));
test('MiniChart: 涨跌着色', () => assert.match(chartSrc, /up \? t\.success : t\.danger/));

// ── OddsChip（packages/ui/src/oddsChip.tsx，涨跌闪态）──
const oddsSrc = readSrc('packages/ui/src/oddsChip.tsx');
test('OddsChip: flash up/down 阈值', () => assert.match(oddsSrc, /flash === 'up'/));
test('OddsChip: ▲▼ 方向符', () => assert.match(oddsSrc, /▲/));
test('OddsChip: 1.2s 后清除闪态', () => assert.match(oddsSrc, /1200/));
test('OddsChip: 选中态背景', () => assert.match(oddsSrc, /selected \? t\.oddsActiveBg/));

// ── Toast（packages/ui/src/toast.tsx，zustand）──
const toastSrc = readSrc('packages/ui/src/toast.tsx');
test('Toast: zustand create store', () => assert.match(toastSrc, /create<ToastState>/));
test('Toast: 最多 3 条堆叠', () => assert.match(toastSrc, /slice\(-3\)/));
test('Toast: action 按钮 8s / 默认 3.5s TTL', () => {
  assert.match(toastSrc, /\? 8000 : 3500/);
});
test('Toast: toastApiError 重试动作', () => assert.match(toastSrc, /toastApiError/));

// ── ConfirmModal（packages/ui/src/modal.tsx，8s 自动确认 + Esc）──
const modalSrc = readSrc('packages/ui/src/modal.tsx');
test('ConfirmModal: autoConfirmMs 倒计时自动确认', () => assert.match(modalSrc, /autoConfirmMs/));
test('Modal: web Esc 关闭', () => assert.match(modalSrc, /Escape/));

// ── OfflineBanner / ErrorBoundary（packages/ui/src/feedback.tsx）──
const fbSrc = readSrc('packages/ui/src/feedback.tsx');
test('OfflineBanner: NetInfo 订阅', () => assert.match(fbSrc, /NetInfo\.addEventListener/));
test('OfflineBanner: 恢复提示 2.5s', () => assert.match(fbSrc, /2500/));
test('ErrorBoundary: getDerivedStateFromError', () => assert.match(fbSrc, /getDerivedStateFromError/));
test('ErrorBoundary: web 提供刷新按钮', () => assert.match(fbSrc, /error-reload/));

// ── Skeleton 4 变体（packages/ui/src/skeleton.tsx）──
const skSrc = readSrc('packages/ui/src/skeleton.tsx');
test('Skeleton: Line/Block/List/Table 四变体', () => {
  assert.match(skSrc, /export function SkeletonLine/);
  assert.match(skSrc, /export function SkeletonBlock/);
  assert.match(skSrc, /export function SkeletonList/);
  assert.match(skSrc, /export function SkeletonTable/);
});

// ── DataTable / Select（packages/ui/src/table.tsx + form.tsx）──
const tblSrc = readSrc('packages/ui/src/table.tsx');
const formSrc = readSrc('packages/ui/src/form.tsx');
test('DataTable: 泛型列 + render', () => {
  assert.match(tblSrc, /export interface Column<T>/);
  assert.match(tblSrc, /render\?: \(row: T\)/);
});
test('DataTable: 加载骨架 + 行 hover', () => {
  assert.match(tblSrc, /SkeletonTable/);
  assert.match(tblSrc, /onHoverIn/);
});
test('Select: 下拉选项 testID 可测', () => assert.match(formSrc, /-option-/));

// ── SupportChat（packages/ui/src/supportChat.tsx）──
const scSrc = readSrc('packages/ui/src/supportChat.tsx');
test('SupportChat: AsyncStorage 持久化', () => assert.match(scSrc, /AsyncStorage\.setItem\(STORAGE_KEY/));
test('SupportChat: Alert 替代 window.confirm', () => assert.match(scSrc, /Alert\.alert/));

// ── admin 面板（apps/mobile/src/admin/panels）──
const slipSrc = readSrc('apps/mobile/src/admin/panels/BetSlip.tsx');
test('BetSlip: parlay 模式 toggle', () => assert.match(slipSrc, /\['single', 'parlay'\] as Mode\[\]/));
test('BetSlip: 赔率相乘 combinedPrice', () => assert.match(slipSrc, /reduce\(\(acc, it\) => acc \* it\.price, 1\)/));
test('BetSlip: 真串关 placeParlayItems（旧版循环单注 bug 已修）', () => assert.match(slipSrc, /placeParlayItems/));
test('BetSlip: ConfirmModal 8s 自动确认', () => assert.match(slipSrc, /autoConfirmMs=\{8000\}/));
test('BetSlip: 赔率变化 flash 检测', () => assert.match(slipSrc, /oddsFlash/));
test('BetSlip: admin 代客下注', () => assert.match(slipSrc, /proxy-user-select/));

const betsSrc = readSrc('apps/mobile/src/admin/panels/BetsPanel.tsx');
test('BetsPanel: flashIds + prevBetsRef 结算闪动', () => {
  assert.match(betsSrc, /flashIds/);
  assert.match(betsSrc, /prevBetsRef/);
});
test('BetsPanel: 输赢着色', () => {
  assert.match(betsSrc, /o === 'win'\) return t\.success/);
  assert.match(betsSrc, /o === 'lose'\) return t\.danger/);
});

const explorerSrc = readSrc('apps/mobile/src/admin/panels/MatchesExplorer.tsx');
test('MatchesExplorer: 多 sport 选择', () => assert.match(explorerSrc, /setSports\(/));
test('MatchesExplorer: 联赛搜索 leagueQ', () => assert.match(explorerSrc, /leagueQ/));
test('MatchesExplorer: 仅开盘 onlyWithOdds', () => assert.match(explorerSrc, /onlyWithOdds/));
test('MatchesExplorer: 预设 AsyncStorage 持久化', () => assert.match(explorerSrc, /AsyncStorage\.setItem\(PRESETS_KEY/));
test('MatchesExplorer: FlatList 虚拟滚动（>40 条）', () => {
  assert.match(explorerSrc, /VIRTUAL_THRESHOLD = 40/);
  assert.match(explorerSrc, /getItemLayout/);
});
test('MatchesExplorer: 实时赔率 useLiveOdds', () => assert.match(explorerSrc, /useLiveOdds/));
test('MatchesExplorer: MatchDetail 弹窗', () => assert.match(explorerSrc, /<MatchDetail/));

// ── 键盘快捷键（apps/mobile/src/admin/keyboard.tsx，web-only ref 注册表）──
const kbSrc = readSrc('apps/mobile/src/admin/keyboard.tsx');
test('Keyboard: web-only 激活', () => assert.match(kbSrc, /Platform\.OS !== 'web'/));
test('Keyboard: 输入框内不触发', () => assert.match(kbSrc, /INPUT|TEXTAREA|SELECT/));
test('Keyboard: 1/2/3 + Enter + ? + Esc', () => {
  assert.match(kbSrc, /'1' \|\| e\.key === '2' \|\| e\.key === '3'/);
  assert.match(kbSrc, /registerSubmit/);
  assert.match(kbSrc, /'\?'/);
});

// ── 门禁（apps/mobile/src/app/admin/_layout.tsx）──
const layoutSrc = readSrc('apps/mobile/src/app/admin/_layout.tsx');
test('AdminLayout: 角色门禁 admin/support', () => assert.match(layoutSrc, /'admin' \|\| user\.role === 'support'/));
test('AdminLayout: 未登录跳登录页（带 from 回跳）', () => assert.match(layoutSrc, /Redirect href=\{`\/admin\/login\?from=/));

// ── 根布局（apps/mobile/src/app/_layout.tsx：web 同源 / native 直连 + AsyncStorage）──
const rootLayoutSrc = readSrc('apps/mobile/src/app/_layout.tsx');
test('RootLayout: web 相对 /api、native 直连', () => {
  assert.match(rootLayoutSrc, /Platform\.OS !== 'web'/);
  assert.match(rootLayoutSrc, /EXPO_PUBLIC_API_BASE/);
});
test('RootLayout: native 注入 AsyncStorage + 异步恢复会话', () => {
  assert.match(rootLayoutSrc, /setAuthStorage\(AsyncStorage\)/);
  assert.match(rootLayoutSrc, /restoreSessionAsync\(\)/);
});
test('RootLayout: 错误上报接线', () => assert.match(rootLayoutSrc, /setupErrorReporter\(\)/));
test('RootLayout: ErrorBoundary 包裹', () => assert.match(rootLayoutSrc, /<ErrorBoundary>/));

// ── Storybook（docs/storybook 仍保留，标注 stale）──
test('Storybook: index.html 存在', () => {
  const m = readSrc('docs/storybook/index.html');
  assert.match(m, /Storybook/);
});
test('Storybook: 至少 20 个 markdown 文档', () => {
  let count = 0;
  function walk(dir) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.md')) count++;
    }
  }
  walk(join(root, 'docs/storybook'));
  assert.ok(count >= 20, `Storybook docs 应 >= 20, 实际 ${count}`);
});
