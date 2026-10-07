// scripts/test_match_detail.mjs — MatchDetail mock odds + 交互逻辑（unify-frontend-expo 重写，指向 apps/mobile/src/admin）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const detailSrc = readFileSync(join(root, 'apps/mobile/src/admin/MatchDetail.tsx'), 'utf8');
const libSrc = readFileSync(join(root, 'apps/mobile/src/admin/lib.ts'), 'utf8');

test('MatchDetail: mockOddsHistory 函数存在', () => {
  assert.match(detailSrc, /function mockOddsHistory/);
});

test('MatchDetail: 终点等于 basePrice', () => {
  assert.match(detailSrc, /out\[out\.length\s*-\s*1\]\s*=\s*basePrice/);
});

test('MatchDetail: 默认 n = 24 数据点', () => {
  assert.match(detailSrc, /function mockOddsHistory\(basePrice:\s*number,\s*n\s*=\s*24\)/);
});

test('MatchDetail: 价格 floor 1.01', () => {
  assert.match(detailSrc, /Math\.max\(1\.01/);
});

test('MatchDetail: impliedProb 处理除零', () => {
  assert.match(detailSrc, /function impliedProb/);
  assert.match(detailSrc, /if\s*\(price\s*<=\s*1\)\s*return\s*['"]—['"]/);
});

test('lib: fmtFull 手动补零（Hermes 无 Intl 也安全）', () => {
  assert.match(libSrc, /function fmtFull/);
  assert.match(libSrc, /padStart\(2, ['"]0['"]\)/);
});

test('MatchDetail: 加注按钮未登录禁用', () => {
  assert.match(detailSrc, /disabled=\{market\.status\s*!==\s*'open'\s*\|\|\s*!loggedIn\}/);
});

test('MatchDetail: 渲染 MiniChart for each odds', () => {
  assert.match(detailSrc, /<MiniChart\s+data=\{mockOddsHistory\(o\.price\)\}/);
});

test('MatchDetail: 加注按钮变 🔒 登录 / 已关闭 / ＋ 加注', () => {
  assert.match(detailSrc, /🔒 登录/);
  assert.match(detailSrc, /已关闭/);
  assert.match(detailSrc, /＋ 加注/);
});

test('MatchDetail: 市场页签禁用态（非 open）', () => {
  assert.match(detailSrc, /disabled=\{!open\}/);
});
