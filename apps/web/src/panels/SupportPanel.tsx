// panels/SupportPanel.tsx — 客服工單（admin / support）
import { useEffect, useState, useCallback } from 'react';
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
import { toast } from '../store.js';
import { SkeletonTable } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';

const PAGE_SIZE = 10;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
}

export function SupportPanel() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
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

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    void api.listSupportCategories().then((r) => setCategories(r.categories)).catch(() => {});
    void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
  }, []);

  const categoryLabel = (key: string) => categories.find((c) => c.key === key)?.label ?? key;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openDetail = async (t: SupportTicket) => {
    try {
      const res = await api.adminGetTicket(t.id);
      setDetail(res);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const sendReply = async () => {
    if (!detail || !reply.trim()) { toast.warn('请输入回复内容'); return; }
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
    <section className="card fade-in">
      <h2>🎫 工單/客服</h2>
      <div className="row">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">全部状态</option>
          {Object.entries(SUPPORT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">全部分类</option>
          {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input
          placeholder="用户名"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const u = users.find((x) => x.name === userName.trim());
              setUserId(u?.id);
              setPage(1);
            }
          }}
          style={{ maxWidth: 120 }}
        />
        <button onClick={() => void refresh()} className="ghost small">↻</button>
      </div>
      {loading ? <SkeletonTable rows={5} cols={6} /> : tickets.length === 0 ? (
        <EmptyState icon="🎫" title="暂无工单" />
      ) : (
        <>
          <table>
            <thead><tr><th>#</th><th>用户</th><th>主题</th><th>状态</th><th>时间</th><th></th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td>#{t.id}</td>
                  <td>{t.user_name ?? `#${t.user_id}`}</td>
                  <td>{t.subject}</td>
                  <td><span className={`badge ${t.status}`}>{SUPPORT_STATUS_LABELS[t.status] ?? t.status}</span></td>
                  <td className="muted">{fmtTime(t.created_at)}</td>
                  <td><button className="ghost small" onClick={() => void openDetail(t)}>详情</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="ghost small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>←</button>
            <span className="muted">{page}/{totalPages} · {total}条</span>
            <button className="ghost small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
          </div>
        </>
      )}
      {detail && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <h3>#{detail.ticket.id} · {detail.ticket.subject}{' '}
            <span className={`badge ${detail.ticket.status}`}>{SUPPORT_STATUS_LABELS[detail.ticket.status]}</span>
            {detail.ticket.priority && (
              <span className="badge" style={{ marginLeft: 6 }}>{SUPPORT_PRIORITY_LABELS[detail.ticket.priority] ?? detail.ticket.priority}</span>
            )}
          </h3>
          <div className="stack" style={{ margin: '12px 0' }}>
            <div className="message-bubble user-bubble">
              <div className="muted" style={{ marginBottom: 4 }}>🧑 用户 · {categoryLabel(detail.ticket.category)}</div>
              {detail.ticket.body}
            </div>
            {detail.messages.map((m) => {
              const isAgent = m.author_role === 'agent';
              return (
                <div key={m.id} className={`message-bubble ${isAgent ? 'agent-bubble' : 'user-bubble'}`}>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    {isAgent ? '🛠 客服' : '🧑 用户'} · {fmtTime(m.created_at)}
                  </div>
                  {m.content}
                </div>
              );
            })}
          </div>
          {canReply && (
            <div className="row">
              <input
                className="wide"
                placeholder="回复..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && void sendReply()}
              />
              <button onClick={() => void sendReply()} disabled={busy}>发送</button>
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            {nextStatuses.map((s) => (
              <button key={s} className="ghost small" onClick={() => void changeStatus(s)} disabled={busy}>
                → {SUPPORT_STATUS_LABELS[s]}
              </button>
            ))}
            <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={() => setDetail(null)}>← 返回</button>
          </div>
        </div>
      )}
    </section>
  );
}
