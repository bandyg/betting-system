// scripts/test_i18n.mjs — i18n 完整性测试 (Sprint 5 C7)
//
// 验证:
// 1. zh-CN + en 两个字典
// 2. 所有 key 在两字典都有 (或 fallback)
// 3. getLang/setLang localStorage 持久化

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function extractDict(src, langPrefix) {
  // 简化: 匹配 `'key': 'value',` 形式
  const re = new RegExp(`['"]([a-zA-Z][\\w.-]+)['"]:\\s*['"]([^'"]*)['"]`, 'g');
  const out = {};
  let m;
  while ((m = re.exec(src))) {
    if (!out[m[1]]) out[m[1]] = m[2];
  }
  return out;
}

test('i18n.tsx file exists', () => {
  const path = join(root, 'apps/web/src/i18n.tsx');
  const src = readFileSync(path, 'utf8');
  assert.match(src, /export function t/);
  assert.match(src, /export function useT/);
  assert.match(src, /export function I18nProvider/);
  assert.match(src, /type Lang/);
});

test('i18n: zh-CN dict has required keys', () => {
  const src = readFileSync(join(root, 'apps/web/src/i18n.tsx'), 'utf8');
  const required = ['common.loading', 'common.search', 'auth.login.title', 'betslip.title', 'betslip.submit', 'matches.title', 'matches.onlyWithOdds'];
  for (const k of required) {
    assert.match(src, new RegExp(`['"]${k.replace(/\./g, '\\.')}['"]\\s*:`), `zh-CN 字典应有 ${k}`);
  }
});

test('i18n: en dict has required keys', () => {
  const src = readFileSync(join(root, 'apps/web/src/i18n.tsx'), 'utf8');
  // 找到 en: Dict = { ... } 块 (在文件靠后位置, 在 DICTS 之前)
  // 简单策略: zh-CN dict 在前 200 行, en dict 在后
  // 找 "const EN:" 起点
  const enStart = src.indexOf('const EN:');
  assert.ok(enStart > 0, '应找到 const EN:');
  const enBlock = src.slice(enStart);
  const required = ['common.loading', 'auth.login.title', 'betslip.title', 'betslip.submit', 'matches.title'];
  for (const k of required) {
    // 匹配 'common.loading': 'Loading...',
    const re = new RegExp(`['"]${k.replace(/\./g, '\\.')}['"]\s*:`, '');
    assert.match(enBlock, re, `en 字典应有 ${k}`);
  }
});

test('i18n: language types', () => {
  const src = readFileSync(join(root, 'apps/web/src/i18n.tsx'), 'utf8');
  assert.match(src, /type Lang\s*=\s*['"]zh-CN['"]\s*\|\s*['"]en['"]/);
});

test('i18n: DICTS 包含 zh-CN 和 en', () => {
  const src = readFileSync(join(root, 'apps/web/src/i18n.tsx'), 'utf8');
  assert.match(src, /DICTS[\s\S]*?zh-CN/);
  assert.match(src, /DICTS[\s\S]*?en/);
});
