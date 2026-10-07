// scripts/test_tokens.mjs — 统一 Design Tokens 完整性测试（unify-frontend-expo 后单一来源 = packages/ui）
//
// 验证:
// 1. packages/ui/src/tokens.ts 是唯一权威来源（dark+light 双主题、梯度完整）
// 2. 主题 Provider 提供模式切换
// 3. 状态徽章语义映射完整

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const tokensSrc = readFileSync(join(root, 'packages/ui/src/tokens.ts'), 'utf8');
const themeSrc = readFileSync(join(root, 'packages/ui/src/theme.tsx'), 'utf8');

function extractBlock(src, name) {
  const re = new RegExp(`export const ${name}[\\s\\S]*?\\} as const;`);
  const m = src.match(re);
  return m ? m[0] : '';
}

function extractKeys(block) {
  const out = [];
  const re = /^\s{2}(\w+):/gm;
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}

const darkBlock = extractBlock(tokensSrc, 'colors');
const lightBlock = extractBlock(tokensSrc, 'lightColors');
const darkKeys = extractKeys(darkBlock);
const lightKeys = extractKeys(lightBlock);

test('tokens: colors / lightColors 均导出', () => {
  assert.match(tokensSrc, /export const colors/, '应有 colors');
  assert.match(tokensSrc, /export const lightColors/, '应有 lightColors（双主题）');
  assert.match(tokensSrc, /export const themes/, '应聚合导出 themes');
});

test('tokens: dark 与 light 键集合一致', () => {
  assert.deepEqual([...darkKeys].sort(), [...lightKeys].sort(), `dark/light 键不一致:\ndark=${darkKeys}\nlight=${lightKeys}`);
});

test('tokens: 必需语义色齐备', () => {
  const required = ['bg', 'bgElevated', 'bgGlass', 'border', 'borderStrong', 'text', 'textSecondary', 'textMuted', 'primary', 'secondary', 'accent', 'success', 'danger', 'warning', 'info', 'oddsBg', 'oddsBorder', 'oddsActiveBg', 'oddsActiveBorder'];
  for (const k of required) {
    assert.ok(darkKeys.includes(k), `dark 缺 ${k}`);
    assert.ok(lightKeys.includes(k), `light 缺 ${k}`);
  }
});

test('tokens: light bg 与 dark bg 不同（真实双主题）', () => {
  const darkBg = darkBlock.match(/\sbg:\s*'([^']+)'/)?.[1];
  const lightBg = lightBlock.match(/\sbg:\s*'([^']+)'/)?.[1];
  assert.ok(darkBg && lightBg);
  assert.notEqual(darkBg, lightBg);
});

test('tokens: space 8 档（4px 网格，web 梯度并入）', () => {
  const spaceBlock = extractBlock(tokensSrc, 'space');
  for (const [k, v] of Object.entries({ 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 })) {
    const re = new RegExp(`\\s${k}:\\s*${v}\\b`);
    assert.ok(re.test(spaceBlock), `space.${k} 应为 ${v}`);
  }
});

test('tokens: radius 6 档 + fontSize 梯度 + fw 字重', () => {
  for (const k of ['sm', 'md', 'lg', 'xl', "'2xl'", 'pill']) {
    assert.ok(new RegExp(`\\s${k}:`).test(extractBlock(tokensSrc, 'radius')), `radius 缺 ${k}`);
  }
  for (const k of ['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'hero']) {
    assert.ok(new RegExp(`\\s${k}:`).test(extractBlock(tokensSrc, 'fontSize')), `fontSize 缺 ${k}`);
  }
  for (const k of ['normal', 'medium', 'semibold', 'bold']) {
    assert.ok(new RegExp(`\\s${k}:`).test(extractBlock(tokensSrc, 'fw')), `fw 缺 ${k}`);
  }
});

test('tokens: duration 为毫秒数字 + ease 为贝塞尔数组（RN 可直接消费）', () => {
  const dur = extractBlock(tokensSrc, 'duration');
  assert.match(dur, /fast:\s*100/);
  assert.match(dur, /normal:\s*200/);
  assert.match(dur, /slow:\s*400/);
  assert.match(extractBlock(tokensSrc, 'ease'), /\[\s*0\.16,\s*1,\s*0\.3,\s*1\s*\]/);
});

test('tokens: z 层级 + 组件尺寸（web 并入值）', () => {
  const zBlock = extractBlock(tokensSrc, 'z');
  for (const k of ['base', 'dropdown', 'sticky', 'fab', 'toast', 'modal', 'help']) {
    assert.ok(new RegExp(`\\s${k}:`).test(zBlock), `z 缺 ${k}`);
  }
  const sizeBlock = extractBlock(tokensSrc, 'size');
  assert.match(sizeBlock, /headerH:\s*60/);
  assert.match(sizeBlock, /betSlipW:\s*380/);
  assert.match(sizeBlock, /fabSize:\s*52/);
  assert.match(sizeBlock, /supportW:\s*360/);
  assert.match(sizeBlock, /supportH:\s*540/);
});

test('tokens: statusTone 覆盖 9 个业务状态', () => {
  const toneBlock = extractBlock(tokensSrc, 'statusTone');
  for (const s of ['scheduled', 'open', 'in_progress', 'finished', 'settled', 'closed', 'suspended', 'waiting_user', 'resolved']) {
    assert.ok(toneBlock.includes(`${s}:`), `statusTone 缺 ${s}`);
  }
});

test('theme: ThemeProvider 支持受控 mode + useThemeMode 切换', () => {
  assert.match(themeSrc, /mode\?:\s*ThemeMode/);
  assert.match(themeSrc, /onModeChange/);
  assert.match(themeSrc, /export const useThemeMode/);
  assert.match(themeSrc, /lightColors/, '切换时使用 lightColors');
});
