// components/SupportChat.tsx — 客服聊天 widget (Sprint 5 C4)
//
// 右下角浮动按钮 → 打开 chat panel
// 模拟智能回复: 关键词匹配 + FAQ 数据库
// localStorage 持久化历史 + 上下文
//
// 不依赖后端: 所有回复本地生成 (后续可接 API)

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../store.js';
import { Avatar } from './Avatar.js';

interface Message {
  id: number;
  from: 'user' | 'agent';
  text: string;
  ts: number;
}

// 本地 FAQ bot 回复库
const FAQ: Array<{ keywords: string[]; reply: string }> = [
  { keywords: ['下注', '怎么下', '如何下', '投注'],
    reply: '下注流程: 1) 在大厅点赔率 chip 加入投注单 2) 在右侧投注单确认或修改金额 3) 点"提交下注"弹出确认窗 4) 8s 内点确认或按 ESC 取消。组合模式支持多选，赔率相乘。' },
  { keywords: ['结算', '怎么算', '派彩', '输赢'],
    reply: '结算逻辑: 命中派彩 = 投注额 × 赔率。组合下注: 所有选都命中才算赢。系统自动结算后可在"我的投注"查看记录。' },
  { keywords: ['登录', '注册', '账号', '忘记'],
    reply: '当前为 demo 系统，使用 admin/admin123 登录；新用户通过 admin 代客下注创建。生产环境会接用户中心。' },
  { keywords: ['余额', '充值', '提现', '钱'],
    reply: '当前版本为演示，所有余额变更通过 admin 后台手动调整。生产环境会接支付通道。' },
  { keywords: ['联赛', '数据', '赔率'],
    reply: '联赛数据来自 feed 实时拉取 (the-odds-api)。赔率变更会自动闪动提示。赛事详情页 (点队伍名) 查看历史曲线。' },
  { keywords: ['组合', 'parlay', '多注'],
    reply: '组合模式: 投注单 > 1 项时显示"单注/组合"切换。组合模式: 单一金额应用所有选，赔率相乘 (例 2.1 × 1.5 × 3.0 = 9.45)。' },
  { keywords: ['pwa', '离线', '缓存'],
    reply: '本应用是 PWA (Progressive Web App): service worker 缓存静态资源，离线时仍可浏览已加载页。试试: 访问后断网刷新看 banner。' },
  { keywords: ['i18n', '语言', '英文', '切换'],
    reply: '点 header 中/EN 按钮切换语言。支持 zh-CN / en。当前为纯前端实现，无后端依赖。' },
  { keywords: ['快捷键', '键盘', '快捷'],
    reply: '全局快捷键: ? 打开帮助, / 聚焦搜索, Esc 关闭 modal。投注时 1/2/3 选择第 N 个 odds chip, Enter 提交。' },
  { keywords: ['bug', '问题', '错误', '出错'],
    reply: '请查看 console (F12) 错误。本应用已配置 window.onerror 全局捕获 + localStorage 保存最近 50 条，调试 API: __getErrors() / __clearErrors()。' },
  { keywords: ['admin', '代客', '管理员'],
    reply: 'admin 登录后可在"账户/赛事管理/结算/Feed/客服"页查看全功能。代客下注: 投注单底部选用户。' },
  { keywords: ['缓存', 'data'],
    reply: 'odds-flash: 投注单赔率变化时闪动提示。saved presets: 智能筛选保存到 localStorage。' },
];

const QUICK_REPLIES = [
  '📝 如何下注?',
  '💰 结算怎么算?',
  '🔗 组合模式怎么用?',
  '⌨️ 快捷键有哪些?',
  '🌐 离线能用吗?',
  '🐛 报错怎么看?',
];

const STORAGE_KEY = 'supportchat.messages';

function detectReply(text: string): string {
  const lower = text.toLowerCase();
  for (const entry of FAQ) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return entry.reply;
    }
  }
  // fallback
  return '收到您的问题。常见问题可试试顶部快捷问题，或联系 admin 在"客服"页提交工单 (admin 会回复)。';
}

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultGreeting();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch { /* ignore */ }
  return defaultGreeting();
}

function defaultGreeting(): Message[] {
  return [
    { id: 1, from: 'agent', text: '👋 你好! 我是 Betting Admin 的智能助手。可以问我下注/结算/快捷键/PWA 等问题。', ts: Date.now() },
  ];
}

export function SupportChat() {
  const user = useAuth((s: { user: { name: string } | null }) => s.user);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const idRef = useRef(1000);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // persist
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))); } catch { /* ignore */ }
  }, [messages]);

  // scroll to bottom when messages change & open
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setUnread(0);
    }
  }, [messages, open]);

  // 新消息未打开时 unread+1
  useEffect(() => {
    if (!open && messages.length > 1) {
      const last = messages[messages.length - 1];
      if (last.from === 'agent') setUnread((n) => n + 1);
    }
  }, [messages, open]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = { id: ++idRef.current, from: 'user', text, ts: Date.now() };
    setMessages((cur) => [...cur, userMsg]);
    setInput('');
    // 模拟 agent 回复延迟
    window.setTimeout(() => {
      const reply: Message = { id: ++idRef.current, from: 'agent', text: detectReply(text), ts: Date.now() };
      setMessages((cur) => [...cur, reply]);
    }, 600 + Math.random() * 600);
    // focus back
    inputRef.current?.focus();
  }, [input]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [send]);

  const clearHistory = useCallback(() => {
    if (!confirm('清空聊天记录？')) return;
    setMessages(defaultGreeting());
  }, []);

  const welcome = useMemo(() => `👋 你好${user ? ` ${user.name}` : ''}! 我能帮你什么?`, [user]);

  return (
    <>
      {/* 浮动按钮 */}
      <button
        className={`support-fab ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label={open ? '关闭客服' : '打开客服'}
        title="客服助手"
      >
        {open ? '✕' : '💬'}
        {unread > 0 && !open && <span className="support-unread">{unread}</span>}
      </button>

      {/* chat panel */}
      {open && (
        <div className="support-panel scale-in" role="dialog" aria-label="客服聊天">
          <div className="support-head">
            <span className="support-head-info">
              <Avatar name="Bot" size={28} />
              <div>
                <strong>智能助手</strong>
                <span className="muted" style={{ fontSize: 11, display: 'block' }}>● 在线 · 通常秒回</span>
              </div>
            </span>
            <div className="support-head-actions">
              <button className="ghost small" onClick={clearHistory} title="清空聊天">🗑</button>
              <button className="ghost small" onClick={() => setOpen(false)} aria-label="关闭">✕</button>
            </div>
          </div>

          <div className="support-list" ref={listRef}>
            {messages.map((m) => (
              <div key={m.id} className={`support-msg ${m.from}`}>
                {m.from === 'agent' && <Avatar name="Bot" size={24} />}
                <div className="support-bubble">
                  {m.text}
                  <span className="support-time muted">
                    {new Date(m.ts).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="support-quick">
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>常见问题:</div>
                {QUICK_REPLIES.map((q) => (
                  <button
                    key={q}
                    className="ghost small"
                    onClick={() => { setInput(q.replace(/^[^\s]+\s/, '')); inputRef.current?.focus(); }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="support-input-area">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="输入问题... (Enter 发送, Shift+Enter 换行)"
              rows={2}
              maxLength={500}
            />
            <button onClick={send} disabled={!input.trim()} className="primary">发送</button>
          </div>
          <p className="support-hint muted">回车发送 · ESC 关闭 · 历史保存到 localStorage</p>
        </div>
      )}
    </>
  );
}