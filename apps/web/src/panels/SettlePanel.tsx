// panels/SettlePanel.tsx — 结算（admin 专）
import { useEffect, useState, useCallback } from 'react';
import { api, type Match } from '@betting/core';
import { toast } from '../store.js';

export function SettlePanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState<number | ''>('');
  const [homeScore, setHomeScore] = useState('1');
  const [awayScore, setAwayScore] = useState('0');

  const refresh = useCallback(async () => {
    try {
      const res = await api.listMatches();
      setMatches(res.matches);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const recordAndSettle = async () => {
    if (matchId === '') { toast.warn('请选择赛事'); return; }
    const hs = Number(homeScore); const as = Number(awayScore);
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) {
      toast.warn('比分必须是非负整数');
      return;
    }
    try {
      await api.recordResult(Number(matchId), hs, as);
      const res = await api.settleMatch(Number(matchId));
      toast.ok(`结算完成：总派彩 ¥${res.totalPayout}，总退款 ¥${res.totalRefund}（${res.summary.length} 个市场）`);
      await refresh();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="card fade-in">
      <h2>💰 结算</h2>
      <div className="row">
        <select value={matchId} onChange={(e) => setMatchId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">选择赛事</option>
          {matches.filter((m) => m.status === 'finished').map((m) => (
            <option key={m.id} value={m.id}>#{m.id} {m.home_team} vs {m.away_team}</option>
          ))}
        </select>
        <input type="number" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} min="0" style={{ width: 70 }} placeholder="主队比分" />
        <span className="muted">:</span>
        <input type="number" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} min="0" style={{ width: 70 }} placeholder="客队比分" />
        <button onClick={recordAndSettle}>记录比分并结算</button>
      </div>
      <button onClick={() => void refresh()} className="ghost small">↻ 刷新</button>
    </section>
  );
}
