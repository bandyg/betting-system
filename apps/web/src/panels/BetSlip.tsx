// panels/BetSlip.tsx — 投注单（Bet365 直下注模式，K1 复刻）
import { useState, useEffect } from 'react';
import { api, type Bet, SEL_LABELS, TYPE_LABELS } from '@betting/core';
import { useAuth, toast } from '../store.js';
import type { Match, Market, OddsItem } from '@betting/core';

export interface BasketItem {
  key: string;        // `${marketId}:${selection}`
  marketId: number;
  matchLabel: string;
  marketLabel: string;
  selection: string;
  price: number;
}

interface Props {
  items: BasketItem[];
  onRemove: (key: string) => void;
  onClear: () => void;
}

export function BetSlip({ items, onRemove, onClear }: Props) {
  const user = useAuth((s: { user: import('@betting/core').User | null }) => s.user);
  const role = useAuth((s: { role: string }) => s.role);
  const isAdmin = role === 'admin';

  const [stake, setStake] = useState('100');
  const [proxyUid, setProxyUid] = useState<number | ''>('');
  const [users, setUsers] = useState<{ id: number; name: string; balance: number }[]>([]);

  useEffect(() => {
    if (isAdmin) {
      void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
    }
  }, [isAdmin]);

  const stakeNum = Number(stake) || 0;
  const totalPotential = items.reduce((n, it) => n + it.price * stakeNum, 0);

  const submit = async () => {
    const s = Number(stake);
    if (!(s > 0)) { toast.warn('投注额必须大于 0'); return; }
    if (items.length === 0) { toast.warn('投注单为空，请先在大厅点击赔率选择'); return; }
    if (!user && !isAdmin) { toast.warn('请先登录再下注'); return; }
    if (isAdmin && proxyUid === '') { toast.warn('代客下注请先选择用户'); return; }
    const uid = isAdmin ? Number(proxyUid) : user!.id;
    let okCount = 0;
    let lastBet: Bet | null = null;
    let lastAccount: { balance: number } | null = null;
    for (const it of items) {
      try {
        const res = await api.placeBet(uid, it.marketId, it.selection, s);
        okCount += 1;
        lastBet = res.bet;
        lastAccount = res.account;
      } catch (e) {
        toast.err(`#${it.marketId} ${SEL_LABELS[it.selection] ?? it.selection} 下注失败：${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    if (okCount > 0) {
      const pot = lastBet ? `，潜在派彩 ¥${lastBet.potential_payout}` : '';
      toast.ok(`下注成功：${okCount} 笔${lastBet ? `（#${lastBet.id}${pot}）` : ''}`);
      onClear();
      if (lastAccount && isAdmin) {
        void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
      }
    }
  };

  return (
    <section className="card bet-slip fade-in">
      <h2>🧾 投注单 {items.length > 0 && <span className="badge open">{items.length}</span>}</h2>
      {items.length === 0 ? (
        <div className="muted" style={{ padding: '12px 0' }}>点击赛事赔率加入投注单</div>
      ) : (
        <>
          {items.map((it) => (
            <div key={it.key} className="bet-slip-item">
              <div>
                <div className="muted">{it.matchLabel} · {it.marketLabel}</div>
                <span className="sel">{SEL_LABELS[it.selection] ?? it.selection}</span>{' '}
                <span className="price">@{it.price}</span>
              </div>
              <button className="bet-slip-remove ghost small" onClick={() => onRemove(it.key)} title="移除" aria-label="移除">✕</button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 10 }}>
            <label>投注额</label>
            <input type="number" value={stake} onChange={(e) => setStake(e.target.value)} min="1" />
            <span className="muted">每注</span>
          </div>
          {isAdmin && (
            <div className="row">
              <label>代客下注</label>
              <select value={proxyUid} onChange={(e) => setProxyUid(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">选择用户</option>
                {users.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.name}（¥{u.balance}）</option>)}
              </select>
            </div>
          )}
          <div className="row">
            <span className="muted">可赢 ¥{totalPotential.toFixed(2)}</span>
            <button onClick={submit} style={{ marginLeft: 'auto' }}>提交下注</button>
          </div>
        </>
      )}
      {!user && (
        <div className="auth-hint" style={{ marginTop: 10 }}>
          🔒 请先登录再下注：当前未登录，点击任何赔率会提示先登录。投注前请先在顶部登录。
        </div>
      )}
    </section>
  );
}

// helper: matchesExplorer onPick 类型
export type OnPick = (m: Match, mk: Market, o: OddsItem) => void;
