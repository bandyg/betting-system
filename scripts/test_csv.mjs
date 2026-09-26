// test_csv.mjs — R13 CSV 序列化单元测试（Node 24 --test，纯 JS 零依赖）
//
// 覆盖：RFC 4180 转义（逗号/引号/换行）/ null/undefined/对象 / 空集 / headers 指定 / CRLF 行分隔

import test from 'node:test';
import assert from 'node:assert/strict';
import { csvEscape, csvFromRows, csvFromObjects } from '../apps/api/src/csv.ts';

test('R13-01 csvEscape: 普通字符串原样输出', () => {
  assert.equal(csvEscape('hello'), 'hello');
  assert.equal(csvEscape('充值'), '充值');
});

test('R13-02 csvEscape: 数字 / boolean', () => {
  assert.equal(csvEscape(123), '123');
  assert.equal(csvEscape(1.5), '1.5');
  assert.equal(csvEscape(true), 'true');
});

test('R13-03 csvEscape: 含逗号 → 引号包裹', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
});

test('R13-04 csvEscape: 含双引号 → 引号包裹 + 内部翻倍', () => {
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
});

test('R13-05 csvEscape: 含换行 → 引号包裹', () => {
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(csvEscape('line1\r\nline2'), '"line1\r\nline2"');
});

test('R13-06 csvEscape: null/undefined → 空串', () => {
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});

test('R13-07 csvEscape: 对象 → JSON（内含引号 → 按 RFC 4180 再转义）', () => {
  assert.equal(csvEscape({ a: 1 }), '"{""a"":1}"');
});

test('R13-08 csvFromRows: CRLF 行分隔 + 尾换行', () => {
  const out = csvFromRows([['a', 'b'], ['1', '2']]);
  assert.equal(out, 'a,b\r\n1,2\r\n');
});

test('R13-09 csvFromObjects: 默认取并集 keys 为表头', () => {
  const out = csvFromObjects([
    { date: '2026-09-26', stake: 100 },
    { date: '2026-09-25', stake: 50, bets: 2 },
  ]);
  const lines = out.split('\r\n').filter(Boolean);
  assert.equal(lines.length, 3);
  // 并集列序：date, stake, bets（Set 保序）
  assert.equal(lines[0], 'date,stake,bets');
  assert.equal(lines[1], '2026-09-26,100,');
  assert.equal(lines[2], '2026-09-25,50,2');
});

test('R13-10 csvFromObjects: 指定 headers 列序', () => {
  const out = csvFromObjects([{ a: 1, b: 2 }], ['b', 'a']);
  assert.equal(out, 'b,a\r\n2,1\r\n');
});

test('R13-11 csvFromObjects: 空集 + headers → 仅表头行', () => {
  const out = csvFromObjects([], ['x', 'y']);
  assert.equal(out, 'x,y\r\n');
});

test('R13-12 csvFromObjects: 空集无 headers → 空行', () => {
  assert.equal(csvFromObjects([]), '\r\n');
});

test('R13-13 端到端：trends 行含引号字段（赛事名带逗号）', () => {
  const out = csvFromObjects([
    { matchId: 1, teams: 'FC A, FC B', stake: 100 },
  ]);
  assert.equal(out, 'matchId,teams,stake\r\n1,"FC A, FC B",100\r\n');
});
