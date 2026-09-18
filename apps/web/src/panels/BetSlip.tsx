// panels/BetSlip.tsx — 投注单 (Sprint 2 A3: 单注/组合 模式切换 + accordion + 组合预览)
import { useState, useEffect, useMemo } from 'react';
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

type Mode = 'single' | 'parlay';

export function BetSlip({ items, onRemove, onClear }: Props) {
  const user = useAuth((s: { user: import('@betting/core').User | null }) => s.user);
  const role = useAuth((s: { role: string }) => s.role);
  const isAdmin = role === 'admin';

  const [stake, setStake] = useState('100');                  // 单注/组合模式共用 stake
  const [perStakes, setPerStakes] = useState<Record<string, string>>({});  // 单注模式每注独立 stake
  const [proxyUid, setProxyUid] = useState<number | ''>('');
  const [users, setUsers] = useState<{ id: number; name: string; balance: number }[]>([]);
  const [mode, setMode] = useState<Mode>('single');           // 单注/组合 toggle
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isAdmin) {
      void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
    }
  }, [isAdmin]);

  // 计算组合赔率 (A3 parlay preview)
  const combinedPrice = useMemo(() => {
    if (items.length === 0) return 0;
    return items.reduce((acc, it) => acc * it.price, 1);
  }, [items]);

  const totalStake = useMemo(() => {
    if (items.length === 0) return 0;
    if (mode === 'single') {
      return items.reduce((n, it) => n + (Number(perStakes[it.key]) || 0), 0);
    }
    return Number(stake) || 0;
  }, [items, mode, stake, perStakes]);

  const totalPotential = useMemo(() => {
    if (items.length === 0) return 0;
    if (mode === 'single') {
      return items.reduce((n, it) => n + (Number(perStakes[it.key]) || 0) * it.price, 0);
    }
    return (Number(stake) || 0) * combinedPrice;
  }, [items, mode, stake, perStakes, combinedPrice]);

  const submit = async () => {
    if (items.length === 0) { toast.warn('投注单为空，请先在大厅点击赔率选择'); return; }
    if (!user && !isAdmin) { toast.warn('请先登录再下注'); return; }
    if (isAdmin && proxyUid === '') { toast.warn('代客下注请先选择用户'); return; }
    const uid = isAdmin ? Number(proxyUid) : user!.id;
    let okCount = 0;
    let lastBet: Bet | null = null;
    let lastAccount: { balance: number } | null = null;

    for (const it of items) {
      // 单注模式: perStakes[it.key] 或 fallback stake
      // 组合模式: 全部用 stake
      const s = mode === 'parlay'
        ? Number(stake)
        : Number(perStakes[it.key] ?? stake);
      if (!(s > 0)) { toast.warn(`#${it.marketId} 投注额必须大于 0`); return; }
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
      // 组合模式: 派彩 = stake × combinedPrice
      // 单注模式: lastBet.potential_payout
      const summary = mode === 'parlay'
        ? `（组合赔率 ${combinedPrice.toFixed(2)}，潜在派彩 ¥${((Number(stake) || 0) * combinedPrice).toFixed(2)}）`
        : lastBet ? `（#${lastBet.id}，潜在派彩 ¥${lastBet.potential_payout}）` : '';
      toast.ok(`下注成功：${okCount} 笔${summary}`);
      onClear();
      setPerStakes({});
      if (lastAccount && isAdmin) {
        void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
      }
    }
  };

  return (
    <section className="card bet-slip fade-in">
      <div className="bet-slip-head">
        <h2>🧾 投注单 {items.length > 0 && <span className="badge open">{items.length}</span>}</h2>
        {items.length > 1 && (
          <div className="mode-toggle" role="tablist" aria-label="投注模式">
            <button
              role="tab"
              aria-selected={mode === 'single'}
              className={mode === 'single' ? 'active' : ''}
              onClick={() => setMode('single')}
            >单注</button>
            <button
              role="tab"
              aria-selected={mode === 'parlay'}
              className={mode === 'parlay' ? 'active' : ''}
              onClick={() => setMode('parlay')}
              title="组合模式: 单一投注额应用所有选, 赔率相乘"
            >🔗 组合</button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <div className="muted" style={{ padding: '12px 0' }}>点击赛事赔率加入投注单</div>
      ) : (
        <>
          {items.map((it) => {
            const isOpen = !collapsed[it.key];
            const itemStake = mode === 'parlay'
              ? Number(stake) || 0
              : Number(perStakes[it.key] ?? stake) || 0;
            return (
              <div key={it.key} className="bet-slip-item-accordion">
                <div className="bet-slip-item-head" onClick={() => setCollapsed((c) => ({ ...c, [it.key]: !c[it.key] }))}>
                  <span className="caret">{isOpen ? '▼' : '▶'}</span>
                  <span className="sel">{SEL_LABELS[it.selection] ?? it.selection}</span>
                  <span className="price">@{it.price}</span>
                  <span className="muted" style={{ fontSize: 11 }}>· {it.matchLabel}</span>
                  <button
                    className="bet-slip-remove ghost small"
                    onClick={(e) => { e.stopPropagation(); onRemove(it.key); }}
                    title="移除"
                    aria-label="移除"
                  >✕</button>
                </div>
                {isOpen && (
                  <div className="bet-slip-item-body">
                    <div className="muted" style={{ fontSize: 11 }}>{it.matchLabel} · {it.marketLabel}</div>
                    {mode === 'single' && (
                      <div className="row" style={{ marginTop: 6 }}>
                        <label>投注</label>
                        <input
                          className="betslip-per-stake"
                          type="number"
                          value={perStakes[it.key] ?? ''}
                          placeholder={stake}
                          min="1"
                          onChange={(e) => setPerStakes((p) => ({ ...p, [it.key]: e.target.value }))}
                          style={{ maxWidth: 90 }}
                        />
                        <span className="muted">可赢 ¥{(itemStake * it.price).toFixed(2)}</span>
                      </div>
                    )}
                    {mode === 'parlay' && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                        组合权重: ×{it.price.toFixed(2)} · 此注分配派彩 ¥{(itemStake * it.price).toFixed(2)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Parlay preview bar (A3) */}
          {mode === 'parlay' && items.length > 1 && (
            <div className="parlay-preview">
              <div className="row">
                <span className="muted">组合赔率</span>
                <strong style={{ fontSize: 16, color: 'var(--accent)' }}>×{combinedPrice.toFixed(2)}</strong>
              </div>
              <div className="row">
                <span className="muted">投注额 (每注)</span>
                <input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  min="1"
                  style={{ maxWidth: 100 }}
                />
              </div>
              <div className="row">
                <span className="muted">总投注</span>
                <strong>¥{totalStake.toFixed(2)}</strong>
              </div>
              <div className="row parlay-win">
                <span>可赢 (全部命中)</span>
                <strong style={{ fontSize: 18 }}>¥{totalPotential.toFixed(2)}</strong>
              </div>
            </div>
          )}

          {/* Single mode stake (shared) — hide when only 1 item (perStake covers it) */}
          {mode === 'single' && items.length > 1 && (
            <div className="row" style={{ marginTop: 10 }}>
              <label>默认投注额</label>
              <input
                className="betslip-default-stake"
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                min="1"
                placeholder="新注默认"
              />
              <span className="muted">每注</span>
            </div>
          )}

          {isAdmin && (
            <div className="row">
              <label>代客下注</label>
              <select value={proxyUid} onChange={(e) => setProxyUid(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">选择用户</option>
                {users.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.name}（¥{u.balance}）</option>)}
              </select>
            </div>
          )}

          <div className="row bet-slip-footer">
            <span className="muted">
              {mode === 'parlay' && items.length > 1
                ? `单注 ¥${(Number(stake) || 0).toFixed(2)} · 共 ${items.length} 选`
                : `总投注 ¥${totalStake.toFixed(2)} · 共 ${items.length} 选`}
            </span>
            <strong style={{ color: 'var(--success)' }}>可赢 ¥{totalPotential.toFixed(2)}</strong>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button onClick={submit} className="primary bet-slip-submit" style={{ flex: 1 }}>提交下注</button>
            <button onClick={onClear} className="ghost" title="清空投注单">✕ 清空</button>
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
