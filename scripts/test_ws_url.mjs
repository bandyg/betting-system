// test_ws_url.mjs — wsUrlFromApiBase 单元测试（Node 24 --test，直跑 .ts）
//
// 覆盖：http→ws / https→wss / 尾部 /api 剥离 / 自定义 path / 相对 base 无 window 抛错 / 相对 base 有 location

import test from 'node:test';
import assert from 'node:assert/strict';
import { setApiBase, wsUrlFromApiBase } from '../packages/core/src/api.ts';

test('WS-01 http 绝对地址 → ws + 剥离 /api', () => {
  setApiBase('http://100.66.5.26:4100/api');
  assert.equal(wsUrlFromApiBase(), 'ws://100.66.5.26:4100/ws/odds');
});

test('WS-02 https 绝对地址 → wss', () => {
  setApiBase('https://api.example.com/api');
  assert.equal(wsUrlFromApiBase(), 'wss://api.example.com/ws/odds');
});

test('WS-03 尾部斜杠与自定义 path', () => {
  setApiBase('http://h:4100/api/');
  assert.equal(wsUrlFromApiBase('ws/x'), 'ws://h:4100/ws/x');
});

test('WS-04 无 /api 后缀的 base 原样使用', () => {
  setApiBase('http://h:4100');
  assert.equal(wsUrlFromApiBase(), 'ws://h:4100/ws/odds');
});

test('WS-05 相对 base 且无 window → 抛错', () => {
  setApiBase('/api');
  assert.throws(() => wsUrlFromApiBase(), /setApiBase/);
});

test('WS-06 相对 base + window.location → 同源推导', () => {
  globalThis.window = { location: { protocol: 'http:', host: '127.0.0.1:4300' } };
  try {
    assert.equal(wsUrlFromApiBase(), 'ws://127.0.0.1:4300/ws/odds');
  } finally {
    delete globalThis.window;
  }
});
