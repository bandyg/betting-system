// scripts/test_match_detail.mjs — MatchDetail mock odds + 比赛逻辑 (Sprint 5 C7)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const detailSrc = readFileSync(join(root, 'apps/web/src/components/MatchDetail.tsx'), 'utf8');

test('MatchDetail: mockOddsHistory 函数存在', () => {
  assert.match(detailSrc, /function mockOddsHistory/);
});

test('MatchDetail: 终点等于 basePrice', () => {
  // mockOddsHistory 末尾 assert out[out.length - 1] = basePrice
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

test('MatchDetail: fmtFull 完整时间格式', () => {
  assert.match(detailSrc, /hour12:\s*false/);
});

test('MatchDetail: handlePick 未登录禁用', () => {
  assert.match(detailSrc, /disabled=\{[^}]*!loggedIn[^}]*\}/);
});

test('MatchDetail: 渲染 MiniChart for each odds', () => {
  assert.match(detailSrc, /<MiniChart\s+data=\{mockOddsHistory\(o\.price\)\}/);
});

test('MatchDetail: 加注按钮变 🔒 登录 / 已关闭 / ＋ 加注', () => {
  assert.match(detailSrc, /🔒 登录/);
  assert.match(detailSrc, /已关闭/);
  assert.match(detailSrc, /＋ 加注/);
});