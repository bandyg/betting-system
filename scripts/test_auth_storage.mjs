// test_auth_storage.mjs — core auth 存储适配器单元测试（Node 24 --test，直跑 .ts）
//
// 覆盖：适配器注入后 restoreSessionAsync 恢复 user+token / 空存储返回 null / 注释掉 localStorage 路径不回归

import test from 'node:test';
import assert from 'node:assert/strict';
import { setAuthStorage, restoreSessionAsync, resetAuthForTest } from '../packages/core/src/hooks.ts';
import { setAuthToken, getAuthToken } from '../packages/core/src/api.ts';

function mockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => map.set(k, v),
    removeItem: async (k) => map.delete(k),
    __map: map,
  };
}

test('AUTH-01 适配器恢复 user + token', async () => {
  resetAuthForTest();
  const store = mockStorage({
    'betting.currentUser': JSON.stringify({ id: 7, name: 'admin', role: 'admin', balance: 100 }),
    'betting.token': 'jwt-abc',
  });
  setAuthStorage(store);
  const u = await restoreSessionAsync();
  assert.equal(u?.name, 'admin');
  assert.equal(getAuthToken(), 'jwt-abc');
});

test('AUTH-02 空存储返回 null 且不动 token', async () => {
  resetAuthForTest();
  setAuthToken('keep-me');
  setAuthStorage(mockStorage());
  const u = await restoreSessionAsync();
  assert.equal(u, null);
  assert.equal(getAuthToken(), 'keep-me');
});

test('AUTH-03 脏 JSON 安全返回 null', async () => {
  resetAuthForTest();
  setAuthStorage(mockStorage({ 'betting.currentUser': '{oops' }));
  const u = await restoreSessionAsync();
  assert.equal(u, null);
});
