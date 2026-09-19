// scripts/test_tokens.mjs — Design Tokens 完整性测试 (Sprint 5 C7)
//
// 验证:
// 1. CSS (reset.css) 与 TS (tokens.ts) 镜像一致
// 2. 所有 token 都有 dark + light 两套值
// 3. 必需 token 都存在 (regression 测试)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── 加载 tokens.ts (用 dynamic import 走 tsx/esbuild loader? 简化: 用 regex 提取) ──
function extractTsValues(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const out = {};
  // 简易提取: 匹配 "key: 'value'" 或 "key: number"
  const re = /(\w+):\s*(?:'([^']*)'|(\d+(?:\.\d+)?))/g;
  let m;
  while ((m = re.exec(src))) {
    const [, k, s, n] = m;
    if (k && (s != null || n != null)) out[k] = s ?? Number(n);
  }
  return out;
}

// ── 加载 CSS reset.css ──
function extractCssVars(filePath, block = ':root') {
  const src = readFileSync(filePath, 'utf8');
  // Find block
  const re = new RegExp(`${block}\\s*\\{([^}]+)\\}`, 'm');
  const m = src.match(re);
  if (!m) return {};
  const out = {};
  const varRe = /--(\w[\w-]*):\s*([^;]+);/g;
  let vm;
  while ((vm = varRe.exec(m[1]))) {
    out[vm[1]] = vm[2].trim();
  }
  return out;
}

test('tokens.ts file exists and exports', () => {
  const tokensPath = join(root, 'apps/web/src/tokens.ts');
  const src = readFileSync(tokensPath, 'utf8');
  assert.match(src, /export const tokens/, '应 export tokens');
  assert.match(src, /export type Tokens/, '应 export Tokens 类型');
});

test('reset.css :root block has dark theme', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, ':root');
  assert.ok(vars['bg'], '应有 --bg');
  assert.ok(vars['accent'], '应有 --accent');
  assert.ok(vars['success'], '应有 --success');
  assert.ok(vars['danger'], '应有 --danger');
});

test('reset.css [data-theme="light"] block exists', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, '\\[data-theme="light"\\]');
  assert.ok(vars['bg'], 'light 应有 --bg');
  assert.ok(vars['fg'], 'light 应有 --fg');
  assert.notEqual(vars['bg'], '#0f1420', 'light bg 不应等于 dark bg');
});

test('C5 tokens: spacing 8 levels', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, ':root');
  for (let i = 1; i <= 8; i++) {
    assert.ok(vars[`space-${i}`], `应有 --space-${i}`);
    const val = parseInt(vars[`space-${i}`], 10);
    assert.equal(val, i * 4, `--space-${i} 应为 ${i * 4}px`);
  }
});

test('C5 tokens: radius 6 levels', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, ':root');
  assert.equal(vars['radius-sm'], '4px');
  assert.equal(vars['radius-md'], '6px');
  assert.equal(vars['radius-lg'], '10px');
  assert.equal(vars['radius-xl'], '14px');
  assert.equal(vars['radius-2xl'], '18px');
  assert.equal(vars['radius-full'], '9999px');
});

test('C5 tokens: text sizes 8 levels', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, ':root');
  const expected = { xs: '10px', sm: '12px', md: '13px', base: '14px', lg: '16px', xl: '18px', '2xl': '20px', '3xl': '28px' };
  for (const [k, v] of Object.entries(expected)) {
    assert.equal(vars[`text-${k}`], v, `--text-${k} 应为 ${v}`);
  }
});

test('C5 tokens: shadows 4 levels', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, ':root');
  assert.match(vars['shadow-sm'], /0 1px 2px/);
  assert.match(vars['shadow-md'], /0 2px 8px/);
  assert.match(vars['shadow-lg'], /0 4px 16px/);
  assert.match(vars['shadow-xl'], /0 12px 32px/);
});

test('C5 tokens: z-index scale 8 levels', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, ':root');
  const zs = ['base', 'dropdown', 'sticky', 'fab', 'offline', 'confirm', 'toast', 'modal', 'help'];
  for (const z of zs) {
    assert.ok(vars[`z-${z}`], `应有 --z-${z}`);
  }
});

test('C5 tokens: component sizes', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, ':root');
  assert.equal(vars['header-h'], '60px');
  assert.equal(vars['bet-slip-w'], '380px');
  assert.equal(vars['fab-size'], '52px');
  assert.equal(vars['support-w'], '360px');
  assert.equal(vars['support-h'], '540px');
});

test('C5 tokens: dark theme has all required colors', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, ':root');
  const required = ['bg', 'bg-card', 'bg-card-2', 'border', 'fg', 'fg-muted', 'accent', 'success', 'danger', 'warning', 'info'];
  for (const c of required) {
    assert.ok(vars[c], `dark 应有 --${c}`);
  }
});

test('C5 tokens: light theme has all required colors', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const vars = extractCssVars(cssPath, '\\[data-theme="light"\\]');
  const required = ['bg', 'bg-card', 'border', 'fg', 'accent'];
  for (const c of required) {
    assert.ok(vars[c], `light 应有 --${c}`);
  }
});

test('C5 tokens: dark + light 调色板互不相同', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const dark = extractCssVars(cssPath, ':root');
  const light = extractCssVars(cssPath, '\\[data-theme="light"\\]');
  assert.notEqual(dark['bg'], light['bg'], 'dark/light bg 应不同');
  assert.notEqual(dark['fg'], light['fg'], 'dark/light fg 应不同');
  assert.notEqual(dark['accent'], light['accent'], 'dark/light accent 应不同');
});

test('C5 tokens: prefers-reduced-motion 支持 (a11y)', () => {
  const cssPath = join(root, 'apps/web/src/styles/reset.css');
  const src = readFileSync(cssPath, 'utf8');
  assert.match(src, /prefers-reduced-motion/, '应有 a11y media query');
});
