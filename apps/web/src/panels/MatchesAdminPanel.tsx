// panels/MatchesAdminPanel.tsx — 建赛 & 市场（admin 专）
import { useEffect, useState, useCallback } from 'react';
import { api, type Match } from '@betting/core';
import { toast } from '../store.js';

export function MatchesAdminPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [home, setHome] = useState('Arsenal');
  const [away, setAway] = useState('Chelsea');
  const [kickoff, setKickoff] = useState('2026-08-20T15:00');
  const [sport, setSport] = useState('');
  const [league, setLeague] = useState('');
  const [mktMatch, setMktMatch] = useState<number | ''>('');
  const [mktType, setMktType] = useState<'1x2' | 'ah' | 'ou'>('1x2');
  const [mktLine, setMktLine] = useState('-1.5');
  const [oddsA, setOddsA] = useState('2.1');
  const [oddsB, setOddsB] = useState('3.4');
  const [oddsC, setOddsC] = useState('3.2');

  const refresh = useCallback(async () => {
    try {
      const res = await api.listMatches();
      setMatches(res.matches);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createMatch = async () => {
    if (!home.trim() || !away.trim()) { toast.warn('主客队名必填'); return; }
    try {
      const res = await api.createMatch(
        home.trim(), away.trim(), new Date(kickoff).toISOString(),
        sport || undefined, league || undefined,
      );
      toast.ok(`创建成功：#${res.match.id}`);
      await refresh();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const createMarket = async () => {
    if (mktMatch === '') { toast.warn('先选择赛事'); return; }
    let line: number | null = null;
    if (mktType !== '1x2') {
      line = Number(mktLine);
      if (!Number.isFinite(line) || line === 0) { toast.warn('line 必须是非 0 数字'); return; }
    }
    const a = Number(oddsA); const b = Number(oddsB);
    if (!(a > 1) || !(b > 1)) { toast.warn('赔率必须大于 1'); return; }
    let odds: Record<string, number>;
    if (mktType === '1x2') {
      const c = Number(oddsC);
      if (!(c > 1)) { toast.warn('赔率必须大于 1'); return; }
      odds = { home: a, draw: b, away: c };
    } else if (mktType === 'ah') {
      odds = { home: a, away: b };
    } else {
      odds = { over: a, under: b };
    }
    try {
      const res = await api.createMarket(Number(mktMatch), mktType, line, odds);
      toast.ok(`市场创建成功：#${res.market.id}`);
      await refresh();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const scheduled = matches.filter((m) => m.status === 'scheduled');

  return (
    <section className="card fade-in">
      <h2>🏟️ 建赛 & 市场</h2>
      <h3>建赛事</h3>
      <div className="row">
        <input value={home} onChange={(e) => setHome(e.target.value)} placeholder="主队" style={{ maxWidth: 120 }} />
        <span className="muted">vs</span>
        <input value={away} onChange={(e) => setAway(e.target.value)} placeholder="客队" style={{ maxWidth: 120 }} />
        <input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
        <input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="sport (可选)" style={{ maxWidth: 120 }} />
        <input value={league} onChange={(e) => setLeague(e.target.value)} placeholder="league (可选)" style={{ maxWidth: 120 }} />
        <button onClick={createMatch} className="ghost">建赛</button>
      </div>
      <h3>添加市场</h3>
      <div className="row">
        <select value={mktMatch} onChange={(e) => setMktMatch(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">选择赛事</option>
          {scheduled.map((m) => <option key={m.id} value={m.id}>{m.home_team} vs {m.away_team}</option>)}
        </select>
        <select value={mktType} onChange={(e) => setMktType(e.target.value as '1x2' | 'ah' | 'ou')}>
          <option value="1x2">胜平负</option>
          <option value="ah">让球</option>
          <option value="ou">大小</option>
        </select>
        {mktType !== '1x2' && (
          <input type="number" step="0.25" value={mktLine} onChange={(e) => setMktLine(e.target.value)} placeholder="line" />
        )}
        <input type="number" step="0.01" value={oddsA} onChange={(e) => setOddsA(e.target.value)} placeholder="赔率 A" />
        <input type="number" step="0.01" value={oddsB} onChange={(e) => setOddsB(e.target.value)} placeholder="赔率 B" />
        {mktType === '1x2' && (
          <input type="number" step="0.01" value={oddsC} onChange={(e) => setOddsC(e.target.value)} placeholder="赔率 C" />
        )}
        <button onClick={createMarket} className="ghost">添加市场</button>
      </div>
      <button onClick={() => void refresh()} className="ghost small">↻ 刷新</button>
    </section>
  );
}
