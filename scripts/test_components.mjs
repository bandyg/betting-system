// scripts/test_components.mjs — 组件关键源码断言 (Sprint 5 C7)
//
// 验证关键功能在源码中存在 (regression test):
// - Avatar / LeagueChip / MiniChart 等

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

// ── Avatar ──
const avatarSrc = readSrc('apps/web/src/components/Avatar.tsx');
test('Avatar: hashHue 函数', () => assert.match(avatarSrc, /function hashHue/));
test('Avatar: HSL 颜色生成', () => assert.match(avatarSrc, /hsl\(\$\{hue\}/));
test('Avatar: 有 src 时渲染 img', () => assert.match(avatarSrc, /<img/));
test('Avatar: 无 src 时渲染首字 circle', () => assert.match(avatarSrc, /toUpperCase\(\)/));
test('Avatar: 接受 size prop', () => assert.match(avatarSrc, /size\?: number/));

// ── LeagueChip ──
const chipSrc = readSrc('apps/web/src/components/LeagueChip.tsx');
const chipCss = readSrc('apps/web/src/styles/components.css');
test('LeagueChip: hashHue 使用', () => assert.match(chipSrc, /const hue = hashHue\(league/));
test('LeagueChip: 接受 size prop', () => assert.match(chipSrc, /size\?:/));
test('LeagueChip: sport emoji 推算', () => assert.match(chipSrc, /SPORT_EMOJI/));
test('LeagueChip: 首字 toUpperCase', () => assert.match(chipSrc, /charAt\(0\)\.toUpperCase\(\)/));
test('LeagueChip: CSS size variants xs/sm/md', () => {
  assert.match(chipCss, /\.league-chip\.lc-xs/);
  assert.match(chipCss, /\.league-chip\.lc-sm/);
  assert.match(chipCss, /\.league-chip\.lc-md/);
});

// ── MiniChart ──
const chartSrc = readSrc('apps/web/src/components/MiniChart.tsx');
test('MiniChart: SVG 折线 path', () => assert.match(chartSrc, /<path\s+d=/));
test('MiniChart: hover tooltip', () => assert.match(chartSrc, /onMouseEnter/));
test('MiniChart: 空数据处理', () => assert.match(chartSrc, /暂无数据/));
test('MiniChart: 填充面积', () => assert.match(chartSrc, /opacity=\{0\.1\}/));

// ── ConfirmBet ──
const confirmSrc = readSrc('apps/web/src/components/ConfirmBet.tsx');
test('ConfirmBet: 8s 自动确认', () => assert.match(confirmSrc, /setSecondsLeft\(8\)/));
test('ConfirmBet: ESC 关闭', () => assert.match(confirmSrc, /key === ['"]Escape['"]/));
test('ConfirmBet: 倒计时显示', () => assert.match(confirmSrc, /\$\{secondsLeft\}s/));
test('ConfirmBet: combinedPrice 显示 (parlay)', () => assert.match(confirmSrc, /combinedPrice\.toFixed\(2\)/));

// ── ErrorReporter ──
const errSrc = readSrc('apps/web/src/lib/ErrorReporter.ts');
test('ErrorReporter: window.onerror 监听', () => assert.match(errSrc, /addEventListener\(['"]error['"]/));
test('ErrorReporter: unhandledrejection 监听', () => assert.match(errSrc, /addEventListener\(['"]unhandledrejection['"]/));
test('ErrorReporter: localStorage 持久化 50 条', () => assert.match(errSrc, /while\s*\(arr\.length\s*>\s*50\)/));
test('ErrorReporter: __getErrors 调试 API', () => assert.match(errSrc, /__getErrors/));
test('ErrorReporter: 防止重复注册', () => assert.match(errSrc, /__errorReporterInstalled/));

// ── OfflineBanner ──
const offlineSrc = readSrc('apps/web/src/components/OfflineBanner.tsx');
test('OfflineBanner: 监听 online/offline 事件', () => assert.match(offlineSrc, /addEventListener\(['"]online['"]/));
test('OfflineBanner: 显示恢复动画 2.5s', () => assert.match(offlineSrc, /2500/));

// ── BetSlip (key functionality) ──
const slipSrc = readSrc('apps/web/src/panels/BetSlip.tsx');
test('BetSlip: parlay 模式 toggle', () => assert.match(slipSrc, /setMode\(['"]parlay['"]/));
test('BetSlip: 赔率相乘 combinedPrice', () => assert.match(slipSrc, /reduce\(\(acc,\s*it\)\s*=>\s*acc\s*\*\s*it\.price/));
test('BetSlip: ConfirmBet 集成', () => assert.match(slipSrc, /<ConfirmBet/));
test('BetSlip: buildConfirmItems 收集', () => assert.match(slipSrc, /buildConfirmItems/));
test('BetSlip: 赔率变化 flash 检测', () => assert.match(slipSrc, /oddsFlash/));
test('BetSlip: 集成 ConfirmBet modal', () => assert.match(slipSrc, /import\s*\{[^}]*ConfirmBet[^}]*\}\s*from\s*['"]\.\.\/components\/ConfirmBet\.js['"]/));

// ── BetsPanel (#5 结算动画) ──
const betsSrc = readSrc('apps/web/src/panels/BetsPanel.tsx');
test('BetsPanel: flashIds state 跟踪', () => assert.match(betsSrc, /flashIds/));
test('BetsPanel: prevBetsRef 比较 status', () => assert.match(betsSrc, /prevBetsRef/));
test('BetsPanel: outcome win/lose 着色', () => {
  // outcome-win/lose 是 CSS classNames (BetsPanel.tsx 用)
  assert.match(betsSrc, /outcome-win|outcome-lose/);
  assert.match(betsSrc, /flash-win|flash-lose/);
});

// ── MatchesExplorer (A6 智能筛选) ──
const explorerSrc = readSrc('apps/web/src/panels/MatchesExplorer.tsx');
test('MatchesExplorer: 多 sport 选择', () => assert.match(explorerSrc, /sports[^=]*=\s*useState<string\[\]>/));
test('MatchesExplorer: 联赛搜索 leagueQ', () => assert.match(explorerSrc, /leagueQ/));
test('MatchesExplorer: 仅开盘 onlyWithOdds', () => assert.match(explorerSrc, /onlyWithOdds/));
test('MatchesExplorer: 预设 localStorage 持久化', () => assert.match(explorerSrc, /localStorage\.(setItem|getItem)/));
test('MatchesExplorer: 虚拟滚动 useVirtualScroll', () => assert.match(explorerSrc, /useVirtualScroll/));
test('MatchesExplorer: LeagueChip 集成', () => assert.match(explorerSrc, /<LeagueChip/));
test('MatchesExplorer: MatchDetail modal', () => assert.match(explorerSrc, /<MatchDetail/));

// ── main.tsx (初始化链) ──
const mainSrc = readSrc('apps/web/src/main.tsx');
test('main: initTheme()', () => assert.match(mainSrc, /initTheme\(\)/));
test('main: setupErrorReporter()', () => assert.match(mainSrc, /setupErrorReporter\(\)/));
test('main: I18nProvider 包裹', () => assert.match(mainSrc, /<I18nProvider/));
test('main: SW 注册 PROD 模式', () => assert.match(mainSrc, /import\.meta\.env\.PROD/));
test('main: ErrorBoundary 包裹', () => assert.match(mainSrc, /<ErrorBoundary>/));
test('main: BrowserRouter 包裹', () => assert.match(mainSrc, /<BrowserRouter/));

// ── PWA manifest + SW ──
test('manifest.webmanifest: 存在', () => {
  const m = readSrc('apps/web/public/manifest.webmanifest');
  assert.match(m, /"name":\s*"Betting Admin"/);
  assert.match(m, /"start_url"/);
  assert.match(m, /"display":\s*"standalone"/);
});
test('sw.js: cache-first 静态资源', () => {
  const m = readSrc('apps/web/public/sw.js');
  assert.match(m, /caches\.match/);
  assert.match(m, /STATIC_CACHE/);
});
test('sw.js: API 不缓存 (network-only)', () => {
  const m = readSrc('apps/web/public/sw.js');
  assert.match(m, /\/api\//);
  assert.match(m, /return;\s*\/\/.*浏览器正常处理/);
});

// ── Storybook (C6) ──
test('Storybook: index.html 存在', () => {
  const m = readSrc('docs/storybook/index.html');
  assert.match(m, /Betting Admin — Storybook/);
  assert.match(m, /17 组件/);
});
test('Storybook: README 索引', () => {
  const m = readSrc('docs/storybook/README.md');
  assert.match(m, /Components Storybook/);
});
test('Storybook: 至少 25 个 markdown 文档', () => {
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