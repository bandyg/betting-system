import { useCallback, useEffect, useState } from 'react';
import { api } from '@betting/core';
import type { Bet, Market, Match, SettleResponse, User } from '@betting/core';
import { MATCH_STATUS_LABELS, SEL_LABELS, TYPE_LABELS } from '@betting/core';

interface Msg { kind: 'ok' | 'err'; text: string }

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

export default function App() {
  return (
    <>
      <header className="top">
        <h1>⚽ 投注系统 Demo</h1>
        <span className="sub">赛前固定赔率 · 下注 · 结算闭环</span>
      </header>
      <div className="grid">
        <AccountsPanel />
        <MatchesPanel />
      </div>
      <div className="grid">
        <BettingPanel />
        <SettlePanel />
      </div>
      <BetsPanel />
    </>
  );
}

/* ---------------- 账户 ---------------- */

function AccountsPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [selId, setSelId] = useState<number | ''>('');
  const [user, setUser] = useState<User | null>(null);
  const [deposit, setDeposit] = useState('1000');
  const [msg, setMsg] = useState<Msg | null>(null);

  const refreshUsers = useCallback(async () => {
    try {
      const res = await api.listUsers();
      setUsers(res.users);
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const loadUser = async (id: number) => {
    try {
      const res = await api.getUser(id);
      setUser(res.user);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  };

  const createUser = async () => {
    if (!name.trim()) { setMsg({ kind: 'err', text: '请输入用户名' }); return; }
    try {
      const res = await api.createUser(name.trim());
      setMsg({ kind: 'ok', text: `创建成功：用户 #${res.user.id}（${res.user.name}），余额 ${res.user.balance}` });
      setName('');
      await refreshUsers();
      setSelId(res.user.id);
      setUser(res.user);
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  };

  const doDeposit = async () => {
    if (selId === '') { setMsg({ kind: 'err', text: '先选择用户' }); return; }
    const amt = Number(deposit);
    if (!(amt > 0)) { setMsg({ kind: 'err', text: '金额必须大于 0' }); return; }
    try {
      const res = await api.deposit(Number(selId), amt);
      setMsg({ kind: 'ok', text: `充值成功：余额 → ${res.account.balance}` });
      await loadUser(Number(selId));
      await refreshUsers();
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  };

  return (
    <section className="card">
      <h2>👤 账户</h2>
      <div className="row">
        <input className="wide" placeholder="新用户名（如 demo）" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={createUser}>创建用户</button>
      </div>
      <div className="row">
        <label>选择用户</label>
        <select value={selId} onChange={(e) => { const v = e.target.value; setSelId(v === '' ? '' : Number(v)); if (v !== '') loadUser(Number(v)); }}>
          <option value="">— 请选择 —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>#{u.id} {u.name}</option>
          ))}
        </select>
        <input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} min="1" />
        <button onClick={doDeposit} className="ghost">充值</button>
      </div>
      {user && (
        <div className="row">
          <span className="muted">当前用户：#{user.id} {user.name}</span>
          <span className="balance">余额 ¥{user.balance}</span>
        </div>
      )}
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

/* ---------------- 赛事 + 市场 ---------------- */

function MatchesPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [home, setHome] = useState('Arsenal');
  const [away, setAway] = useState('Chelsea');
  const [kickoff, setKickoff] = useState('2026-08-20T15:00');
  const [msg, setMsg] = useState<Msg | null>(null);
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
      setMsg({ kind: 'err', text: String(e) });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createMatch = async () => {
    if (!home.trim() || !away.trim()) { setMsg({ kind: 'err', text: '主客队名必填' }); return; }
    try {
      const res = await api.createMatch(home.trim(), away.trim(), new Date(kickoff).toISOString());
      setMsg({ kind: 'ok', text: `赛事创建成功：#${res.match.id} ${res.match.home_team} vs ${res.match.away_team}` });
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  };

  const createMarket = async () => {
    if (mktMatch === '') { setMsg({ kind: 'err', text: '先选择赛事' }); return; }
    let line: number | null = null;
    if (mktType !== '1x2') {
      line = Number(mktLine);
      if (!Number.isFinite(line) || line === 0) { setMsg({ kind: 'err', text: '让球/大小盘 line 必须是非 0 数字' }); return; }
    }
    const a = Number(oddsA);
    const b = Number(oddsB);
    if (!(a > 1) || !(b > 1)) { setMsg({ kind: 'err', text: '赔率必须大于 1' }); return; }
    let odds: Record<string, number>;
    if (mktType === '1x2') {
      const c = Number(oddsC);
      if (!(c > 1)) { setMsg({ kind: 'err', text: '赔率必须大于 1' }); return; }
      odds = { home: a, draw: b, away: c };
    } else if (mktType === 'ah') {
      odds = { home: a, away: b };
    } else {
      odds = { over: a, under: b };
    }
    try {
      const res = await api.createMarket(Number(mktMatch), mktType, line, odds);
      setMsg({ kind: 'ok', text: `市场创建成功：#${res.market.id} ${TYPE_LABELS[mktType]}${line != null ? ` @${line}` : ''}` });
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  };

  const label = (m: Match) => `${m.home_team} vs ${m.away_team} (${fmtTime(m.kickoff_time)})`;
  const scheduled = matches.filter((m) => m.status === 'scheduled');

  return (
    <section className="card">
      <h2>🏟️ 赛事 & 市场</h2>
      <div className="row">
        <input className="wide" value={home} onChange={(e) => setHome(e.target.value)} style={{ maxWidth: 120 }} />
        <span className="muted">vs</span>
        <input className="wide" value={away} onChange={(e) => setAway(e.target.value)} style={{ maxWidth: 120 }} />
        <input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
        <button onClick={createMatch} className="ghost">建赛</button>
      </div>
      <h3>添加市场</h3>
      <div className="row">
        <select value={mktMatch} onChange={(e) => setMktMatch(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">— 选择赛事 —</option>
          {scheduled.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
        </select>
        <select value={mktType} onChange={(e) => setMktType(e.target.value as '1x2' | 'ah' | 'ou')}>
          <option value="1x2">胜平负 1x2</option>
          <option value="ah">让球 AH</option>
          <option value="ou">大小 OU</option>
        </select>
        {mktType !== '1x2' && <input type="number" step="0.25" value={mktLine} onChange={(e) => setMktLine(e.target.value)} placeholder="line" />}
        <input type="number" step="0.01" value={oddsA} onChange={(e) => setOddsA(e.target.value)} />
        <input type="number" step="0.01" value={oddsB} onChange={(e) => setOddsB(e.target.value)} />
        {mktType === '1x2' && <input type="number" step="0.01" value={oddsC} onChange={(e) => setOddsC(e.target.value)} />}
        <button onClick={createMarket} className="ghost">添加市场</button>
      </div>
      <button onClick={refresh} className="ghost small">↻ 刷新赛事</button>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      <table>
        <thead>
          <tr><th>赛事</th><th>开赛</th><th>状态</th><th>市场/赔率</th></tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id}>
              <td>
                <strong>{m.home_team} vs {m.away_team}</strong>
                <div className="mono">#{m.id}{m.home_score != null ? ` · ${m.home_score}:${m.away_score}` : ''}</div>
              </td>
              <td>{fmtTime(m.kickoff_time)}</td>
              <td><span className={`badge ${m.status}`}>{MATCH_STATUS_LABELS[m.status] ?? m.status}</span></td>
              <td>
                {m.markets.length === 0 && <span className="muted">无市场</span>}
                {m.markets.map((mk) => (
                  <div key={mk.id}>
                    <span className={`badge ${mk.status}`}>{TYPE_LABELS[mk.type] ?? mk.type}{mk.line != null ? ` @${mk.line}` : ''}</span>
                    <span className="muted"> #{mk.id} </span>
                    {mk.odds.map((o) => (
                      <span key={o.selection} className="odds-chip">{SEL_LABELS[o.selection] ?? o.selection} {o.price}</span>
                    ))}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ---------------- 下注 ---------------- */

function BettingPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [userId, setUserId] = useState<number | ''>('');
  const [marketId, setMarketId] = useState<number | ''>('');
  const [selection, setSelection] = useState('');
  const [stake, setStake] = useState('100');
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
    api.listMatches().then((r) => setMatches(r.matches)).catch(() => {});
  }, []);

  type MarketWithMatch = Market & { match: Match };
  const markets: MarketWithMatch[] = matches.flatMap((m) =>
    m.markets
      .filter((mk) => mk.status === 'open')
      .map((mk) => ({ ...mk, match: m }))
  );

  const selMarket = markets.find((mk) => mk.id === marketId);

  const placeBet = async () => {
    if (userId === '') { setMsg({ kind: 'err', text: '请先选择用户' }); return; }
    if (marketId === '') { setMsg({ kind: 'err', text: '请选择市场' }); return; }
    if (!selection) { setMsg({ kind: 'err', text: '请选择投注项' }); return; }
    const amt = Number(stake);
    if (!(amt > 0)) { setMsg({ kind: 'err', text: '下注金额必须大于 0' }); return; }
    try {
      const res = await api.placeBet(Number(userId), Number(marketId), selection, amt);
      setMsg({
        kind: 'ok',
        text: `下注成功：#${res.bet.id} ${SEL_LABELS[selection]} ${amt} @ ${res.bet.price} → 潜在派彩 ${res.bet.potential_payout}；余额 ${res.account.balance}`
      });
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  };

  return (
    <section className="card">
      <h2>🎯 下注</h2>
      <div className="row">
        <label>用户</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">— 请选择 —</option>
          {users.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.name}</option>)}
        </select>
        <label>市场</label>
        <select value={marketId} onChange={(e) => { setMarketId(e.target.value === '' ? '' : Number(e.target.value)); setSelection(''); }}>
          <option value="">— 请选择 —</option>
          {markets.map((mk) => (
            <option key={mk.id} value={mk.id}>
              {mk.match.home_team} vs {mk.match.away_team} · {TYPE_LABELS[mk.type]}{mk.line != null ? ` @${mk.line}` : ''} #{mk.id}
            </option>
          ))}
        </select>
      </div>
      {selMarket && (
        <div className="row">
          {selMarket.odds.map((o) => (
            <button
              key={o.selection}
              className={`ghost small ${selection === o.selection ? 'selected' : ''}`}
              style={selection === o.selection ? { borderColor: '#4a6cf7', background: '#22315c' } : undefined}
              onClick={() => setSelection(o.selection)}
            >
              {SEL_LABELS[o.selection] ?? o.selection} @ {o.price}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <label>金额</label>
        <input type="number" min="1" value={stake} onChange={(e) => setStake(e.target.value)} />
        <button onClick={placeBet}>下注</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

/* ---------------- 结算 ---------------- */

function SettlePanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState<number | ''>('');
  const [homeScore, setHomeScore] = useState('2');
  const [awayScore, setAwayScore] = useState('1');
  const [msg, setMsg] = useState<Msg | null>(null);
  const [result, setResult] = useState<SettleResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listMatches();
      setMatches(res.matches);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const schedulable = matches.filter((m) => m.status === 'scheduled' || m.status === 'finished');
  const label = (m: Match) => `${m.home_team} vs ${m.away_team} [${MATCH_STATUS_LABELS[m.status] ?? m.status}]`;

  const recordResult = async () => {
    if (matchId === '') { setMsg({ kind: 'err', text: '请选择赛事' }); return; }
    const hs = Number(homeScore);
    const as = Number(awayScore);
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) {
      setMsg({ kind: 'err', text: '比分必须是非负整数' });
      return;
    }
    try {
      const res = await api.recordResult(Number(matchId), hs, as);
      setMsg({ kind: 'ok', text: `赛果已录：#${res.match.id} ${res.match.home_team} ${hs}:${as} ${res.match.away_team}（状态 ${res.match.status}）` });
      setResult(null);
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  };

  const settle = async () => {
    if (matchId === '') { setMsg({ kind: 'err', text: '请选择赛事' }); return; }
    try {
      const res = await api.settleMatch(Number(matchId));
      setMsg({ kind: 'ok', text: `结算完成：总派彩 ${res.totalPayout}，总退款 ${res.totalRefund}` });
      setResult(res);
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  };

  return (
    <section className="card">
      <h2>🏁 录赛果 & 结算</h2>
      <div className="row">
        <select value={matchId} onChange={(e) => setMatchId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">— 选择赛事 —</option>
          {schedulable.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
        </select>
        <input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} style={{ width: 70 }} />
        <span className="muted">:</span>
        <input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} style={{ width: 70 }} />
        <button onClick={recordResult} className="ghost">录赛果</button>
        <button onClick={settle} className="danger">结算</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      {result && (
        <table>
          <thead>
            <tr><th>市场</th><th>有效注</th><th>赢</th><th>输</th><th>平/退</th><th>派彩</th><th>退款</th></tr>
          </thead>
          <tbody>
            {result.summary.map((s) => (
              <tr key={s.marketId}>
                <td>{TYPE_LABELS[s.type] ?? s.type}{s.line != null ? ` @${s.line}` : ''}</td>
                <td>{s.openBets}</td><td>{s.won}</td><td>{s.lost}</td><td>{s.void}</td>
                <td>{s.payoutAmount}</td><td>{s.refundAmount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ---------------- 投注记录 ---------------- */

function BetsPanel() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<number | ''>('');
  const [msg, setMsg] = useState<Msg | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listBets(userId === '' ? undefined : Number(userId));
      setBets(res.bets);
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  }, [userId]);

  useEffect(() => {
    api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <section className="card">
      <h2>📋 投注记录</h2>
      <div className="row">
        <label>按用户筛选</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">全部</option>
          {users.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.name}</option>)}
        </select>
        <button onClick={refresh} className="ghost small">↻ 刷新</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      <table>
        <thead>
          <tr><th>#</th><th>用户</th><th>市场</th><th>选择</th><th>金额</th><th>赔率</th><th>潜在派彩</th><th>状态</th><th>时间</th></tr>
        </thead>
        <tbody>
          {bets.map((b) => (
            <tr key={b.id}>
              <td>{b.id}</td>
              <td>#{b.user_id}</td>
              <td className="mono">#{b.market_id}</td>
              <td>{SEL_LABELS[b.selection] ?? b.selection}</td>
              <td>{b.stake}</td>
              <td>{b.price}</td>
              <td>{b.potential_payout}</td>
              <td><span className={`badge ${b.status}`}>{b.status}</span></td>
              <td className="mono">{fmtTime(b.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
