import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { Avatar } from './primitives';
import { fontSize, radius, size, spacing } from './tokens';

// 本地 FAQ bot 回复库（自旧 web 版迁移；PWA/i18n 两条随特性下线改写）
const FAQ: Array<{ keywords: string[]; reply: string }> = [
  { keywords: ['下注', '怎么下', '如何下', '投注'],
    reply: '下注流程: 1) 在大厅点赔率 chip 加入投注单 2) 在右侧投注单确认或修改金额 3) 点"提交下注"弹出确认窗 4) 8s 内点确认或按 ESC 取消。组合模式支持多选，赔率相乘。' },
  { keywords: ['结算', '怎么算', '派彩', '输赢'],
    reply: '结算逻辑: 命中派彩 = 投注额 × 赔率。组合下注: 所有选都命中才算赢。系统自动结算后可在"投注历史"查看记录。' },
  { keywords: ['登录', '注册', '账号', '忘记'],
    reply: '当前为 demo 系统，使用 admin/admin123 登录；新用户通过 admin 代客下注创建。生产环境会接用户中心。' },
  { keywords: ['余额', '充值', '提现', '钱'],
    reply: '当前版本为演示，所有余额变更通过 admin 后台手动调整。生产环境会接支付通道。' },
  { keywords: ['联赛', '数据', '赔率'],
    reply: '联赛数据来自 feed 实时拉取 (the-odds-api)。赔率变更会自动闪动提示。赛事详情可查看历史曲线。' },
  { keywords: ['组合', 'parlay', '多注'],
    reply: '组合模式: 投注单 > 1 项时显示"单注/组合"切换。组合模式: 单一金额应用所有选，赔率相乘 (例 2.1 × 1.5 × 3.0 = 9.45)。' },
  { keywords: ['离线', '断网', '缓存'],
    reply: '断网时顶部会显示离线横幅，页面显示的可能是过期数据；恢复连接后横幅会提示"连接已恢复"。' },
  { keywords: ['主题', '暗色', '亮色', '切换'],
    reply: '后台右上角可一键切换暗色/亮色主题，选择会记住，刷新后保持。' },
  { keywords: ['快捷键', '键盘', '快捷'],
    reply: 'Web 后台快捷键: ? 打开帮助, / 聚焦搜索, Esc 关闭 modal。投注时 1/2/3 选择第 N 个 odds chip, Enter 提交。' },
  { keywords: ['bug', '问题', '错误', '出错'],
    reply: '请打开浏览器控制台 (F12) 查看错误。应用已配置全局错误捕获，dev 下可用 __getErrors() / __clearErrors() 调试。' },
  { keywords: ['admin', '代客', '管理员'],
    reply: 'admin 登录后可在"账户/建赛事/结算/Feed/客服"页查看全功能。代客下注: 投注单底部选用户。' },
  { keywords: ['工单', '客服', '人工'],
    reply: '机器人答不了的，可在"客服"页提交工单（选择分类 + 描述），admin 会在工单面板回复。' },
];

const QUICK_REPLIES = ['如何下注?', '结算怎么算?', '组合模式怎么用?', '快捷键有哪些?', '报错怎么看?', '怎么提工单?'];

const STORAGE_KEY = 'supportchat.messages';

function detectReply(text: string): string {
  const lower = text.toLowerCase();
  for (const entry of FAQ) {
    if (entry.keywords.some((kw) => lower.includes(kw.toLowerCase()))) return entry.reply;
  }
  return '收到您的问题。常见问题可试试顶部快捷问题，或到"客服"页提交工单 (admin 会回复)。';
}

function defaultGreeting(): Msg[] {
  return [{ id: 1, from: 'agent', text: '👋 你好! 我是 Betting Admin 的智能助手。可以问我下注/结算/快捷键/工单等问题。', ts: Date.now() }];
}

interface Msg {
  id: number;
  from: 'user' | 'agent';
  text: string;
  ts: number;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 右下角浮动客服 widget：FAQ bot + 快捷问题 + 历史持久化（AsyncStorage） */
export function SupportChat({ userName }: { userName?: string | null }) {
  const t = useTheme();
  const dims = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(defaultGreeting);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const idRef = useRef(1000);
  const listRef = useRef<ScrollView>(null);

  // 载入历史（AsyncStorage；web 端自动落 localStorage）
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 0) setMessages(arr);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // 持久化（最近 50 条）
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))).catch(() => {});
    if (!open && messages.length > 1) {
      const last = messages[messages.length - 1];
      if (last.from === 'agent') setUnread((n) => n + 1);
    }
  }, [messages, open, loaded]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setMessages((cur) => [...cur, { id: ++idRef.current, from: 'user', text, ts: Date.now() }]);
    setInput('');
    setTimeout(() => {
      setMessages((cur) => [...cur, { id: ++idRef.current, from: 'agent', text: detectReply(text), ts: Date.now() }]);
    }, 600 + Math.random() * 600);
  }, [input]);

  const clearHistory = useCallback(() => {
    Alert.alert('清空聊天记录？', '该操作不可恢复', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => setMessages(defaultGreeting()) },
    ]);
  }, []);

  const panelW = Math.min(size.supportW, dims.width - 32);
  const panelH = Math.min(size.supportH, dims.height - 120);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: spacing.lg, bottom: spacing.xl, alignItems: 'flex-end', zIndex: 100 }}>
      {open ? (
        <View
          testID="support-panel"
          style={{
            width: panelW,
            height: panelH,
            backgroundColor: t.bgElevated,
            borderColor: t.border,
            borderWidth: 1,
            borderRadius: radius.lg,
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
            elevation: 16,
            overflow: 'hidden',
          }}
        >
          {/* head */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Avatar name="Bot" size={28} />
              <View>
                <Text style={{ color: t.text, fontWeight: '800', fontSize: fontSize.sm }}>智能助手</Text>
                <Text style={{ color: t.textMuted, fontSize: 11 }}>● 在线 · 通常秒回</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable testID="support-clear" onPress={clearHistory} hitSlop={6}>
                <Text style={{ fontSize: fontSize.md }}>🗑</Text>
              </Pressable>
              <Pressable testID="support-close" onPress={() => setOpen(false)} hitSlop={6}>
                <Text style={{ color: t.textMuted, fontSize: fontSize.md }}>✕</Text>
              </Pressable>
            </View>
          </View>
          {/* messages */}
          <ScrollView
            ref={listRef}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          >
            {messages.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', gap: 6, justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.from === 'agent' ? <Avatar name="Bot" size={22} /> : null}
                <View
                  style={{
                    backgroundColor: m.from === 'user' ? t.oddsActiveBg : t.bg,
                    borderColor: m.from === 'user' ? t.oddsActiveBorder : t.border,
                    borderWidth: 1,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.md - 2,
                    paddingVertical: 8,
                    maxWidth: '78%',
                  }}
                >
                  <Text style={{ color: t.text, fontSize: fontSize.sm }}>{m.text}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 10, alignSelf: 'flex-end', marginTop: 2 }}>{fmtTime(m.ts)}</Text>
                </View>
              </View>
            ))}
            {messages.length === 1 ? (
              <View style={{ gap: 6, marginTop: spacing.xs }}>
                <Text style={{ color: t.textMuted, fontSize: 12 }}>常见问题:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {QUICK_REPLIES.map((q) => (
                    <Pressable
                      key={q}
                      testID={`support-quick-${q}`}
                      onPress={() => setInput(q)}
                      style={{ borderColor: t.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}
                    >
                      <Text style={{ color: t.secondary, fontSize: fontSize.xs }}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
          {/* input */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: t.border }}>
            <TextInput
              testID="support-input"
              value={input}
              onChangeText={setInput}
              placeholder={userName ? `${userName}, 输入问题...` : '输入问题...'}
              placeholderTextColor={t.textMuted}
              multiline
              maxLength={500}
              style={{
                flex: 1,
                color: t.text,
                fontSize: fontSize.sm,
                backgroundColor: t.bg,
                borderColor: t.borderStrong,
                borderWidth: 1,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md - 2,
                paddingVertical: 8,
                minHeight: 38,
                maxHeight: 90,
              }}
              onSubmitEditing={(e) => {
                const ev = e as unknown as { shiftKey?: boolean };
                if (!ev.shiftKey) send();
              }}
            />
            <Pressable
              testID="support-send"
              onPress={send}
              disabled={!input.trim()}
              style={{ backgroundColor: input.trim() ? t.primary : t.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, opacity: input.trim() ? 1 : 0.6 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: fontSize.sm }}>发送</Text>
            </Pressable>
          </View>
          <Text style={{ color: t.textMuted, fontSize: 10, textAlign: 'center', paddingBottom: 6 }}>
            回车发送 · 历史保存在本地{Platform.OS === 'web' ? ' · ESC 关闭' : ''}
          </Text>
        </View>
      ) : null}
      {/* FAB */}
      <Pressable
        testID="support-fab"
        onPress={() => {
          setOpen((o) => !o);
          setUnread(0);
        }}
        accessibilityLabel={open ? '关闭客服' : '打开客服'}
        style={{
          width: size.fabSize,
          height: size.fabSize,
          borderRadius: size.fabSize / 2,
          backgroundColor: open ? t.bgElevated : t.primary,
          borderColor: t.borderStrong,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: t.primary,
          shadowOpacity: 0.5,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 4 },
          elevation: 10,
        }}
      >
        <Text style={{ fontSize: 22 }}>{open ? '✕' : '💬'}</Text>
        {unread > 0 && !open ? (
          <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: t.danger, borderRadius: 9, minWidth: 18, paddingHorizontal: 4, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
