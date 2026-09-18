// panels/BetsPanel.tsx — 投注记录 (Sprint 2 #5 新结算闪动高亮)
import { useEffect, useState, useCallback, useRef } from 'react';
import { api, type Bet, type User, SEL_LABELS } from '@betting/core';
import { useAuth, toast } from '../store.js';
import { SkeletonTable } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
}

// 解析 potential_payout (相对 stake 看是否赢)
function betOutcome(b: Bet): 'win' | 'lose' | 'pending' | 'open' {
  if (b.status === 'open' || b.status === 'cancelled') return 'open';
  if (b.status === 'settled') return 'win';  // API 只区分 settled/未 settled, 简化
  if (b.status === 'lost') return 'lose';
  return 'pending';
}

export function BetsPanel() {
  const user = useAuth((s: { user: import('@betting/core').User | null }) => s.user);
  const role = useAuth((s: { role: string }) => s.role);
  const loggedIn = !!user;
  const isAdmin = role === 'admin';

  const [bets, setBets] = useState<Bet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<number | ''>('');
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());   // #5 新结算闪动
  const prevBetsRef = useRef<Map<number, string>>(new Map());          // #5 上一次 status

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listBets(userId === '' ? undefined : Number(userId));
      // #5 检测新结算: 对比 prev status
      const prev = prevBetsRef.current;
      const newFlash = new Set<number>();
      for (const b of res.bets) {
        const oldSt = prev.get(b.id);
        if (oldSt && oldSt !== b.status && (b.status === 'settled' || b.status === 'lost')) {
          newFlash.add(b.id);
        }
        prev.set(b.id, b.status);
      }
      if (newFlash.size > 0) {
        setFlashIds((cur) => {
          const next = new Set(cur);
          newFlash.forEach((id) => next.add(id));
          return next;
        });
        // 3s 后清除
        window.setTimeout(() => {
          setFlashIds((cur) => {
            const next = new Set(cur);
            newFlash.forEach((id) => next.delete(id));
            return next;
          });
        }, 3000);
      }
      setBets(res.bets);
      setAuthHint(null);
    } catch (e) {
      const st = (e as { status?: number }).status;
      if (st === 401) {
        setBets([]);
        setAuthHint('登录状态已失效，请重新登录');
      } else {
        toast.err(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAdmin) {
      void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    if (loggedIn) {
      setAuthHint(null);
      void refresh();
    } else {
      setBets([]);
      setAuthHint('请先登录后查看投注记录');
    }
  }, [loggedIn, refresh]);

  return (
    <section className="card fade-in">
      <h2>📋 投注记录</h2>
      {isAdmin && (
        <div className="row">
          <select value={userId} onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">全部用户</option>
            {users.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.name}</option>)}
          </select>
          <button onClick={() => void refresh()} className="ghost small">↻ 刷新</button>
        </div>
      )}
      {authHint && <div className="auth-hint">{authHint}</div>}
      {!authHint && loading && <SkeletonTable rows={5} cols={9} />}
      {!authHint && !loading && bets.length === 0 && (
        <EmptyState icon="🎲" title="暂无投注记录" desc="去大厅点几个赔率试试" />
      )}
      {!authHint && !loading && bets.length > 0 && (
        <table>
          <thead>
            <tr><th>#</th><th>用户</th><th>市场</th><th>选择</th><th>金额</th><th>赔率</th><th>派彩</th><th>状态</th><th>时间</th></tr>
          </thead>
          <tbody>
            {bets.map((b) => {
              const outcome = betOutcome(b);
              const isFlashing = flashIds.has(b.id);
              const flashClass = isFlashing ? `flash-${outcome}` : '';
              return (
                <tr key={b.id} className={`bet-row ${flashClass} outcome-${outcome}`}>
                  <td>{b.id}</td>
                  <td>#{b.user_id}</td>
                  <td>#{b.market_id}</td>
                  <td>{b.selection ? (SEL_LABELS[b.selection] ?? b.selection) : '—'}</td>
                  <td>{b.stake}</td>
                  <td>{b.price}</td>
                  <td>
                    {b.potential_payout}
                    {outcome === 'win' && <span className="outcome-icon"> 🎉</span>}
                    {outcome === 'lose' && <span className="outcome-icon"> 💔</span>}
                  </td>
                  <td><span className={`badge ${b.status}`}>{b.status}</span></td>
                  <td className="muted">{fmtTime(b.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}