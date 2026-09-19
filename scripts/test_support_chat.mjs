// scripts/test_support_chat.mjs — SupportChat FAQ bot 测试 (Sprint 5 C7)
//
// 验证: FAQ 关键词匹配逻辑 (从 SupportChat.tsx 源码中提取 FAQ 表)
// 如果 FAQ 改了, 测试会自动反映 (源码级测试)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// 加载 SupportChat.tsx 源码 + 提取 FAQ
const supportSrc = readFileSync(join(root, 'apps/web/src/components/SupportChat.tsx'), 'utf8');

// 提取 FAQ 数组
function extractFaq(src) {
  // FAQ 数组结束于 \n]; (在文件中是数组结束标记, 前面有换行)
  const m = src.match(/const FAQ[\s\S]+?\n\]\;/);
  if (!m) return [];
  // 提取每个 entry: { keywords: [...], reply: '...' }
  const re = /\{\s*keywords:\s*\[([^\]]+)\][\s\S]*?reply:\s*'([^']+)'/g;
  const out = [];
  let match;
  while ((match = re.exec(m[0]))) {
    const kwRe = /'([^']+)'/g;
    const kws = [];
    let kw;
    while ((kw = kwRe.exec(match[1]))) kws.push(kw[1]);
    out.push({ keywords: kws, reply: match[2] });
  }
  return out;
}

// 模拟 detectReply 函数 (从 SupportChat.tsx 复制)
function detectReply(text, faq) {
  const lower = text.toLowerCase();
  for (const entry of faq) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return entry.reply;
    }
  }
  return '收到您的问题。常见问题可试试顶部快捷问题，或联系 admin 在"客服"页提交工单 (admin 会回复)。';
}

const faq = extractFaq(supportSrc);

test('SupportChat: FAQ 至少 10 个 entry', () => {
  assert.ok(faq.length >= 10, `FAQ 应有 >= 10 条, 实际 ${faq.length}`);
});

test('SupportChat: 每条 FAQ 都有 keywords + reply', () => {
  for (const entry of faq) {
    assert.ok(entry.keywords.length > 0, 'keywords 应非空');
    assert.ok(entry.reply.length > 10, `reply 太短: ${entry.reply}`);
  }
});

test('SupportChat: "怎么下注" 命中下注 FAQ', () => {
  const reply = detectReply('怎么下注', faq);
  assert.match(reply, /下注流程/);
});

test('SupportChat: "结算" 命中结算 FAQ', () => {
  const reply = detectReply('结算怎么算', faq);
  assert.match(reply, /命中派彩/);
});

test('SupportChat: "组合" 命中 parlay FAQ', () => {
  const reply = detectReply('组合怎么用', faq);
  assert.match(reply, /parlay/);
});

test('SupportChat: "快捷键" 命中 keyboard FAQ', () => {
  const reply = detectReply('快捷键', faq);
  assert.match(reply, /\?/);
});

test('SupportChat: "PWA" 命中 PWA FAQ', () => {
  const reply = detectReply('pwa 离线', faq);
  assert.match(reply, /PWA/i);
});

test('SupportChat: 不相关问题走 fallback', () => {
  const reply = detectReply('asdfghjkl xyz123', faq);
  assert.match(reply, /常见问题可试试/);
});

test('SupportChat: 大小写不敏感', () => {
  const reply = detectReply('HOW TO PLACE BET', faq);
  assert.match(reply, /下注流程/);
});

test('SupportChat: "login" 命中登录 FAQ', () => {
  const reply = detectReply('怎么 login', faq);
  assert.match(reply, /demo/);
});

test('SupportChat: 6 个快捷回复定义在 QUICK_REPLIES', () => {
  const m = supportSrc.match(/const QUICK_REPLIES\s*=\s*\[([\s\S]+?)\];/);
  assert.ok(m, 'QUICK_REPLIES 应定义');
  const items = m[1].match(/'[^']+'/g);
  assert.ok(items && items.length >= 5, `快捷回复应有 >= 5, 实际 ${items?.length}`);
});

test('SupportChat: STORAGE_KEY 用于持久化', () => {
  assert.match(supportSrc, /localStorage\.(setItem|getItem)\(STORAGE_KEY/);
});