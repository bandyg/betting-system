// 客服工单面板（admin/support）：筛选/分页/详情/回复/状态流转
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  api,
  type SupportCategory,
  type SupportMessage,
  type SupportStatus,
  type SupportTicket,
  type User,
  SUPPORT_STATUS_LABELS,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUS_TRANSITIONS,
} from '@betting/core';
import { Card, DataTable, Input, Select, SectionTitle, Button, Badge, EmptyState, SkeletonTable, toast, useTheme, fontSize, radius, spacing } from '@betting/ui';
import { fmtTime } from '../lib';

const PAGE_SIZE = 10;

export function SupportPanel() {
  const t = useTheme();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [detail, setDetail] = useState<{ ticket: SupportTicket; messages: SupportMessage[] } | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api.adminListTickets({
        status: status || undefined,
        category: category || undefined,
        userId,
        page,
        pageSize: PAGE_SIZE,
      });
      setTickets(res.tickets);
      setTotal(res.total);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [status, category, userId, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    void api.listSupportCategories().then((r) => setCategories(r.categories)).catch(() => {});
    void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
  }, []);

  const categoryLabel = (key: string) => categories.find((c) => c.key === key)?.label ?? key;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openDetail = async (tk: SupportTicket) => {
    try {
      const res = await api.adminGetTicket(tk.id);
      setDetail(res);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const sendReply = async () => {
    if (!detail || !reply.trim()) return toast.warn('请输入回复内容');
    setBusy(true);
    try {
      await api.adminReplyTicket(detail.ticket.id, reply.trim());
      setReply('');
      await openDetail(detail.ticket);
      await refresh();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (target: SupportStatus) => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.adminSetTicketStatus(detail.ticket.id, target);
      await openDetail(detail.ticket);
      await refresh();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canReply = detail ? !['resolved', 'closed'].includes(detail.ticket.status) : false;
  const nextStatuses: SupportStatus[] = detail ? (SUPPORT_STATUS_TRANSITIONS[detail.ticket.status] ?? []) : [];

  return (
    <Card testID="panel-support" style={{ padding: spacing.lg, gap: spacing.md }}>
      <SectionTitle>🎫 工单/客服</SectionTitle>
      <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          testID="support-status-select"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          placeholder="全部状态"
          options={Object.entries(SUPPORT_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
        />
        <Select
          testID="support-category-select"
          value={category}
          onChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
          placeholder="全部分类"
          options={categories.map((c) => ({ value: c.key, label: c.label }))}
        />
        <Input
          testID="support-user-filter"
          value={userName}
          onChangeText={setUserName}
          placeholder="用户名(回车筛选)"
          style={{ width: 150 }}
          onSubmitEditing={() => {
            const u = users.find((x) => x.name === userName.trim());
            setUserId(u?.id);
            setPage(1);
          }}
        />
        <Button title="↻" variant="ghost" onPress={() => void refresh()} style={{ paddingHorizontal: spacing.lg }} />
      </View>

      {detail ? (
        <View testID="support-detail" style={{ gap: spacing.md, borderTopWidth: 1, borderTopColor: t.border, paddingTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Text style={{ color: t.text, fontSize: fontSize.lg, fontWeight: '800' }}>
              #{detail.ticket.id} · {detail.ticket.subject}
            </Text>
            <Badge status={detail.ticket.status} label={SUPPORT_STATUS_LABELS[detail.ticket.status]} />
            {detail.ticket.priority ? <Badge status="open" label={SUPPORT_PRIORITY_LABELS[detail.ticket.priority] ?? detail.ticket.priority} /> : null}
          </View>
          <View style={{ gap: spacing.sm }}>
            <View style={{ backgroundColor: t.bg, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, padding: spacing.md }}>
              <Text style={{ color: t.textMuted, fontSize: fontSize.xs, marginBottom: 4 }}>🧑 用户 · {categoryLabel(detail.ticket.category)}</Text>
              <Text style={{ color: t.text, fontSize: fontSize.sm }}>{detail.ticket.body}</Text>
            </View>
            {detail.messages.map((m) => {
              const isAgent = m.author_role === 'agent';
              return (
                <View
                  key={m.id}
                  style={{
                    backgroundColor: isAgent ? t.oddsActiveBg : t.bg,
                    borderColor: isAgent ? t.oddsActiveBorder : t.border,
                    borderWidth: 1,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    alignSelf: isAgent ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                  }}
                >
                  <Text style={{ color: t.textMuted, fontSize: fontSize.xs, marginBottom: 4 }}>
                    {isAgent ? '🛠 客服' : '🧑 用户'} · {fmtTime(m.created_at)}
                  </Text>
                  <Text style={{ color: t.text, fontSize: fontSize.sm }}>{m.content}</Text>
                </View>
              );
            })}
          </View>
          {canReply ? (
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <Input testID="support-reply-input" value={reply} onChangeText={setReply} placeholder="回复..." style={{ flex: 1 }} onSubmitEditing={() => !busy && void sendReply()} />
              <Button testID="support-reply-send" title="发送" onPress={() => void sendReply()} disabled={busy} style={{ paddingHorizontal: spacing.lg }} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            {nextStatuses.map((s) => (
              <Pressable
                key={s}
                testID={`support-status-${s}`}
                disabled={busy}
                onPress={() => void changeStatus(s)}
                style={{ borderColor: t.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}
              >
                <Text style={{ color: t.secondary, fontSize: fontSize.xs, fontWeight: '700' }}>→ {SUPPORT_STATUS_LABELS[s]}</Text>
              </Pressable>
            ))}
            <Pressable testID="support-detail-back" onPress={() => setDetail(null)} style={{ marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>← 返回</Text>
            </Pressable>
          </View>
        </View>
      ) : loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : tickets.length === 0 ? (
        <EmptyState icon="🎫" title="暂无工单" />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <DataTable<SupportTicket>
            testID="support-table"
            rows={tickets}
            keyExtractor={(tk) => String(tk.id)}
            columns={[
              { key: 'id', label: '#', flex: 0.5, render: (tk) => <Text style={{ color: t.textMuted }}>#{tk.id}</Text> },
              { key: 'user', label: '用户', flex: 1, render: (tk) => <Text style={{ color: t.text }}>{tk.user_name ?? `#${tk.user_id}`}</Text> },
              { key: 'subject', label: '主题', flex: 3, render: (tk) => <Text style={{ color: t.text }} numberOfLines={1}>{tk.subject}</Text> },
              { key: 'status', label: '状态', flex: 1.2, render: (tk) => <Badge status={tk.status} label={SUPPORT_STATUS_LABELS[tk.status] ?? tk.status} /> },
              { key: 'created_at', label: '时间', flex: 1.3, render: (tk) => <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>{fmtTime(tk.created_at)}</Text> },
              {
                key: 'op',
                label: '',
                flex: 1,
                align: 'right',
                render: (tk) => (
                  <Pressable testID={`support-open-${tk.id}`} onPress={() => void openDetail(tk)} hitSlop={6}>
                    <Text style={{ color: t.secondary, fontSize: fontSize.sm, fontWeight: '700' }}>详情</Text>
                  </Pressable>
                ),
              },
            ]}
          />
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <Button title="←" variant="ghost" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} style={{ paddingHorizontal: spacing.lg }} />
            <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>
              {page}/{totalPages} · {total}条
            </Text>
            <Button title="→" variant="ghost" disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)} style={{ paddingHorizontal: spacing.lg }} />
          </View>
        </View>
      )}
    </Card>
  );
}
