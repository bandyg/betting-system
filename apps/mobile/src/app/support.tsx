import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api, useAuth, useSupportTickets, SUPPORT_STATUS_LABELS, SUPPORT_PRIORITY_LABELS } from '@betting/core';
import type { SupportCategory, SupportCategoryKey, SupportMessage, SupportPriority, SupportStatus, SupportTicket } from '@betting/core';
import { Card, Screen, Button, FlashMsg, colors, radius, fontSize, font, spacing, SectionTitle, EmptyState } from '@betting/ui';

function statusColor(s: SupportStatus): string {
  switch (s) {
    case 'open':
    case 'in_progress':
      return colors.info;
    case 'waiting_user':
      return colors.warning;
    case 'resolved':
      return colors.success;
    case 'closed':
      return colors.textMuted;
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 新建工单表单 */
function NewTicketForm({
  categories,
  onCreated,
}: {
  categories: SupportCategory[];
  onCreated: () => void;
}) {
  const [category, setCategory] = useState<SupportCategoryKey>('other');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<SupportPriority>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async () => {
    if (!subject.trim()) {
      setMsg({ kind: 'err', text: '请填写主题' });
      return;
    }
    if (!body.trim()) {
      setMsg({ kind: 'err', text: '请填写问题描述' });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      await api.createSupportTicket({ category, subject: subject.trim(), body: body.trim(), priority });
      setSubject('');
      setBody('');
      setCategory('other');
      setPriority('normal');
      setMsg({ kind: 'ok', text: '✅ 工单已提交，客服会尽快处理' });
      onCreated();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={styles.sectionCard}>
      <Text style={styles.cardTitle}>新建工单</Text>

      <Text style={styles.label}>分类</Text>
      <View style={styles.chipWrap}>
        {categories.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: category === c.key ? colors.oddsActiveBg : colors.oddsBg, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.chipText, { color: category === c.key ? colors.secondary : colors.text }]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>主题</Text>
      <TextInput
        value={subject}
        onChangeText={setSubject}
        placeholder="一句话描述问题（必填）"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />

      <Text style={styles.label}>问题描述</Text>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="详细描述你的问题（必填）"
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={4}
        style={[styles.input, styles.multiline]}
      />

      <Text style={styles.label}>优先级（选填）</Text>
      <View style={styles.chipWrap}>
        {(Object.keys(SUPPORT_PRIORITY_LABELS) as SupportPriority[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPriority(p)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: priority === p ? colors.oddsActiveBg : colors.oddsBg, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.chipText, { color: priority === p ? colors.secondary : colors.text }]}>
              {SUPPORT_PRIORITY_LABELS[p]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Button title={submitting ? '提交中…' : '提交工单'} onPress={submit} loading={submitting} style={{ marginTop: spacing.sm }} />
      {msg && <FlashMsg msg={msg} />}
    </Card>
  );
}

/** 工单详情：訊息串 + 回覆 */
function TicketDetail({
  ticket,
  messages,
  onReplied,
}: {
  ticket: SupportTicket;
  messages: SupportMessage[];
  onReplied: () => void;
}) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const canReply = ticket.status !== 'resolved' && ticket.status !== 'closed';

  const send = async () => {
    if (!reply.trim()) {
      setMsg({ kind: 'err', text: '请输入回复内容' });
      return;
    }
    setSending(true);
    setMsg(null);
    try {
      await api.replySupportTicket(ticket.id, reply.trim());
      setReply('');
      setMsg({ kind: 'ok', text: '✅ 已回复' });
      onReplied();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card style={styles.sectionCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>工单 #{ticket.id} · {ticket.subject}</Text>
        <Text style={[styles.statusText, { color: statusColor(ticket.status) }]}>
          {SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status}
        </Text>
      </View>
      <Text style={styles.hint}>
        {fmtTime(ticket.created_at)} · 优先级 {SUPPORT_PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
      </Text>

      <View style={{ marginTop: spacing.md }}>
        <View style={[styles.bubble, styles.bubbleUser]}>
          <Text style={styles.bubbleMeta}>🧑 用户 · {fmtTime(ticket.created_at)}</Text>
          <Text style={styles.bubbleText}>{ticket.body}</Text>
        </View>
        {messages.map((m) => {
          const isAgent = m.author_role === 'agent';
          return (
            <View key={m.id} style={[styles.bubble, isAgent ? styles.bubbleAgent : styles.bubbleUser]}>
              <Text style={styles.bubbleMeta}>
                {isAgent ? '🛠 客服' : '🧑 用户'} · {fmtTime(m.created_at)}
              </Text>
              <Text style={styles.bubbleText}>{m.content}</Text>
            </View>
          );
        })}
      </View>

      {!canReply ? (
        <Text style={[styles.hint, { marginTop: spacing.md }]}>工单已完结，无法回复</Text>
      ) : (
        <>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder="回复客服…"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.multiline, { marginTop: spacing.md }]}
          />
          <Button title={sending ? '发送中…' : '发送回复'} onPress={send} loading={sending} style={{ marginTop: spacing.sm }} />
        </>
      )}
      {msg && <FlashMsg msg={msg} />}
    </Card>
  );
}

export default function SupportScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const tickets = useSupportTickets();
  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [detail, setDetail] = useState<{ ticket: SupportTicket; messages: SupportMessage[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    api.listSupportCategories().then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  const openDetail = useCallback(async (t: SupportTicket) => {
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await api.getSupportTicket(t.id);
      setDetail(res);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshDetail = useCallback(() => {
    if (detail) openDetail(detail.ticket);
  }, [detail, openDetail]);

  const goLogin = () => {
    router.replace('/account');
  };

  if (!user) {
    return (
      <Screen>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.backText}>‹ 返回</Text>
            </Pressable>
            <Text style={styles.title}>🎫 联系客服</Text>
          </View>
          <View style={styles.center}>
            <EmptyState text="请先登录后再提交工单" />
            <Button title="去登录" onPress={goLogin} style={{ marginTop: spacing.lg }} />
          </View>
        </SafeAreaView>
      </Screen>
    );
  }

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.backText}>‹ 返回</Text>
            </Pressable>
            <Text style={styles.title}>🎫 联系客服</Text>
          </View>

          <NewTicketForm categories={categories} onCreated={() => tickets.refresh()} />

          <SectionTitle style={styles.recordTitle}>📋 我的工单</SectionTitle>

          {tickets.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 16 }} />}
          {tickets.error && <Text style={{ color: colors.danger, marginBottom: 8 }}>加载失败：{tickets.error}</Text>}
          {!tickets.loading && !tickets.error && (tickets.data?.tickets ?? []).length === 0 && (
            <EmptyState text="暂无工单，可先在上面新建" />
          )}

          {(tickets.data?.tickets ?? []).map((t) => (
            <View key={t.id}>
              <Card style={styles.ticketRow}>
                <Pressable onPress={() => openDetail(t)}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.ticketSubject} numberOfLines={1}>{t.subject}</Text>
                    <Text style={[styles.statusText, { color: statusColor(t.status) }]}>
                      {SUPPORT_STATUS_LABELS[t.status] ?? t.status}
                    </Text>
                  </View>
                  <Text style={styles.ticketMeta}>
                    #{t.id} · {fmtTime(t.created_at)} · 优先级 {SUPPORT_PRIORITY_LABELS[t.priority] ?? t.priority}
                  </Text>
                </Pressable>
              </Card>
              {detail?.ticket.id === t.id && (
                <>
                  {detailLoading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 8 }} />}
                  {detailError && <Text style={{ color: colors.danger, marginVertical: 8 }}>加载失败：{detailError}</Text>}
                  {!detailLoading && !detailError && detail && <TicketDetail ticket={detail.ticket} messages={detail.messages} onReplied={refreshDetail} />}
                </>
              )}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  backText: { color: colors.secondary, fontSize: fontSize.md, fontWeight: font.bold },
  title: { fontSize: fontSize.xl, fontWeight: font.bold, color: colors.text },
  center: { alignItems: 'center', marginTop: spacing.xl },
  sectionCard: { marginBottom: spacing.lg },
  cardTitle: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: font.regular, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  recordTitle: { marginTop: spacing.sm },
  label: { color: colors.textSecondary, fontSize: fontSize.xs, marginBottom: 6, marginTop: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  chipText: { fontSize: fontSize.sm, fontWeight: font.regular },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: fontSize.md,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  ticketRow: { marginBottom: spacing.sm },
  ticketSubject: { color: colors.text, fontSize: fontSize.md, fontWeight: font.bold, flex: 1, marginRight: spacing.sm },
  ticketMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  statusText: { fontSize: fontSize.sm, fontWeight: font.bold },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.sm },
  bubble: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, maxWidth: '92%' },
  bubbleUser: { alignSelf: 'flex-start', backgroundColor: 'rgba(124,58,237,0.14)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)' },
  bubbleAgent: { alignSelf: 'flex-end', backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)' },
  bubbleMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: 4 },
  bubbleText: { color: colors.text, fontSize: fontSize.md },
});