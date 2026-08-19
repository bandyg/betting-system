import { useCallback, useEffect, useState } from 'react';
import { api, setAuthToken } from '@betting/core';
import type { Bet, Market, Match, SettleResponse, User, SupportCategory, SupportMessage, SupportStatus, SupportTicket } from '@betting/core';
import { MATCH_STATUS_LABELS, SEL_LABELS, TYPE_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_PRIORITY_LABELS, SUPPORT_STATUS_TRANSITIONS } from '@betting/core';

interface Msg { kind: 'ok' | 'err'; text: string }

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

/** 管理工具页登录条：admin 登录后所有请求自动带 Bearer token（localStorage 持久化） */
function AdminLoginBar({ onRole }: { onRole: (role: string) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState('admin');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem('betting.token');
      if (t) {
        setAuthToken(t);
        setToken(t);
        const r = localStorage.getItem('betting.role');
        if (r) onRole(r);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const login = async () => {
    try {
      const res = await api.login(name.trim(), pw);
      setAuthToken(res.token);
      try {
        localStorage.setItem('betting.token', res.token);
        localStorage.setItem('betting.role', res.user.role ?? 'user');
      } catch {
        /* ignore */
      }
      setToken(res.token);
      onRole(res.user.role ?? 'user');
      setMsg({ kind: 'ok', text: `✅ 已登录：${res.user.name}（${res.user.role}）` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const logout = () => {
    setAuthToken(null);
    setToken(null);
    try {
      localStorage.removeItem('betting.token');
      localStorage.removeItem('betting.role');
    } catch {
      /* ignore */
    }
    onRole('');
    setMsg({ kind: 'ok', text: '已登出（管理操作需重新登录）' });
  };

  return (
    <div style={{ background: '#1a1a2e', color: '#eee', padding: '10px 14px', borderRadius: 8, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>🔐 管理登录</strong>
      {token ? (
        <>
          <span style={{ color: '#4ade80' }}>已登录（token 已保存）</span>
          <button onClick={logout}>退出</button>
        </>
      ) : (
        <>
          <input placeholder="用户名" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 110 }} />
          <input placeholder="密码" type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ width: 110 }} />
          <button onClick={login}>登录</button>
        </>
      )}
      {msg && <span style={{ color: msg.kind === 'ok' ? '#4ade80' : '#f87171' }}>{msg.text}</span>}
    </div>
  );
}

export default function App() {
  const [role, setRole] = useState('');
  const isSupport = role === 'admin' || role === 'support';
  return (
    <>
      <header className="top">
        <h1>⚽ 投注系统 Demo</h1>
        <span className="sub">赛前固定赔率 · 下注 · 结算闭环</span>
      </header>
      <AdminLoginBar onRole={setRole} />
      <div className="grid">
        <AccountsPanel />
        <MatchesPanel />
      </div>
      <div className="grid">
        <BettingPanel />
        <SettlePanel />
      </div>
      <FeedPanel />
      <BetsPanel />
      {isSupport && <SupportPanel />}
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
  const [sport, setSport] = useState('');
  const [league, setLeague] = useState('');
  const [filterSport, setFilterSport] = useState('');
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
      const res = await api.createMatch(home.trim(), away.trim(), new Date(kickoff).toISOString(), sport || undefined, league || undefined);
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
  const filteredMatches = filterSport ? matches.filter((m) => m.sport === filterSport) : matches;

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
      <select value={filterSport} onChange={(e) => setFilterSport(e.target.value)} style={{ fontSize: 12 }}>
        <option value="">全部运动</option>
        <option value="soccer">⚽ Soccer</option>
        <option value="basketball">🏀 Basketball</option>
        <option value="tennis">🎾 Tennis</option>
        <option value="baseball">⚾ Baseball</option>
      </select>
      <button onClick={refresh} className="ghost small">↻ 刷新赛事</button>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      <table>
        <thead>
          <tr><th>赛事</th><th>运动</th><th>开赛</th><th>状态</th><th>市场/赔率</th></tr>
        </thead>
        <tbody>
          {filteredMatches.map((m) => (
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

/* ---------------- 数据源管理 ---------------- */

type FeedLogEntry = {
  id: number;
  provider: string | null;
  requested_at: string;
  status: string | null;
  matches_seen: number | null;
  matches_upserted: number | null;
  errors: string | null;
};

type FeedStatus = {
  manual: boolean;
  autoSettle: boolean;
  lastSync: string | null;
  lastProvider: string | null;
  health: 'ok' | 'error' | 'disabled';
  lastError: string | null;
  feedMatchCount: number;
  feedLog: FeedLogEntry[];
};

const FEED_HEALTH_LABELS: Record<string, string> = {
  ok: '正常',
  error: '错误',
  disabled: '未启用',
};

function FeedPanel() {
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getFeedStatus();
      setStatus(res);
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = async () => {
    if (!status) return;
    setBusy(true);
    try {
      const res = await api.toggleFeedManual(!status.manual);
      setMsg({ kind: 'ok', text: `模式已切换 → ${res.manual ? 'Manual（手动开盘）' : 'Feed（自动拉取）'}` });
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const ingest = async () => {
    setBusy(true);
    try {
      const res = await api.ingestFeedNow();
      if (res.ok) {
        const d = res.detail as { seen?: number; inserted?: number; updated?: number; error?: string };
        const s = res.scores?.detail as { seen?: number; updated?: number; settled?: number; error?: string } | undefined;
        const scoresTxt = s && res.scores?.ok
          ? `；比分 seen ${s.seen ?? 0} / 更新 ${s.updated ?? 0} / 自动派彩 ${s.settled ?? 0}`
          : '';
        setMsg({ kind: 'ok', text: `拉取成功：seen ${d.seen ?? 0}，inserted ${d.inserted ?? 0}，updated ${d.updated ?? 0}${scoresTxt}` });
      } else {
        const d = res.detail as { error?: string };
        setMsg({ kind: 'err', text: `拉取失败：${d.error ?? 'unknown'}` });
      }
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoSettle = async () => {
    if (!status) return;
    setBusy(true);
    try {
      const res = await api.setFeedAutoSettle(!status.autoSettle);
      setMsg({ kind: 'ok', text: `自动派彩 → ${res.auto ? '开（完场比分入库后自动结算）' : '关（需人工结算）'}` });
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const healthColor =
    status?.health === 'ok' ? '#4ade80'
    : status?.health === 'error' ? '#f87171'
    : '#9ca3af';

  return (
    <section className="card">
      <h2>📡 数据源管理</h2>
      <div className="row">
        <span className="muted">模式：</span>
        <span className="badge scheduled">{status ? (status.manual ? 'Manual（手动开盘）' : 'Feed（自动拉取）') : '—'}</span>
        <span className="muted">健康状态：</span>
        <span className="badge" style={{ color: healthColor, borderColor: healthColor }}>
          {status ? (FEED_HEALTH_LABELS[status.health] ?? status.health) : '—'}
        </span>
        <span className="muted">Feed 来源场数：</span>
        <strong>{status?.feedMatchCount ?? 0}</strong>
        <span className="muted">自动派彩：</span>
        <span className="badge" style={{ color: status?.autoSettle ? '#4ade80' : '#9ca3af', borderColor: status?.autoSettle ? '#4ade80' : '#9ca3af' }}>
          {status ? (status.autoSettle ? '开' : '关') : '—'}
        </span>
      </div>
      <div className="row">
        <span className="muted">最后同步：</span>
        <span>{status?.lastSync ? fmtTime(status.lastSync) : '—'}</span>
        {status?.lastProvider && <span className="muted">（{status.lastProvider}）</span>}
      </div>
      {status?.lastError && (
        <div className="row">
          <span className="muted">最近错误：</span>
          <span style={{ color: '#f87171' }}>{status.lastError}</span>
        </div>
      )}
      <div className="row">
        <button onClick={ingest} disabled={busy}>⚡ 立即拉取</button>
        <button onClick={toggle} className="ghost" disabled={busy || !status}>
          {status?.manual ? '切换为 Feed' : '切换为 Manual'}
        </button>
        <button onClick={toggleAutoSettle} className="ghost" disabled={busy || !status}>
          {status?.autoSettle ? '关闭自动派彩' : '开启自动派彩'}
        </button>
        <button onClick={refresh} className="ghost small">↻ 刷新</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      <h3>最近 feed 拉取记录</h3>
      <table>
        <thead>
          <tr><th>时间</th><th>状态</th><th>seen</th><th>upserted</th><th>errors</th></tr>
        </thead>
        <tbody>
          {(status?.feedLog ?? []).map((l) => (
            <tr key={l.id}>
              <td className="mono">{fmtTime(l.requested_at)}</td>
              <td><span className={`badge ${l.status === 'ok' ? 'open' : 'settled'}`}>{l.status ?? '—'}</span></td>
              <td>{l.matches_seen ?? 0}</td>
              <td>{l.matches_upserted ?? 0}</td>
              <td className="mono">{l.errors ?? '—'}</td>
            </tr>
          ))}
          {(status?.feedLog ?? []).length === 0 && (
            <tr><td colSpan={5} className="muted">暂无拉取记录</td></tr>
          )}
        </tbody>
      </table>
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

/* ---------------- 工单/客服 (Step 4-5) ---------------- */

const PAGE_SIZE = 10;

function SupportPanel() {
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
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);

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
      setMsg({ kind: 'err', text: String(e) });
    } finally {
      setBusy(false);
    }
  }, [status, category, userId, page]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    api.listSupportCategories().then((r) => setCategories(r.categories)).catch(() => {});
    api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
  }, []);

  const applyUserName = () => {
    const name = userName.trim();
    if (!name) { setUserId(undefined); setPage(1); return; }
    const u = users.find((x) => x.name === name);
    if (!u) { setMsg({ kind: 'err', text: `未找到用户「${name}」` }); setUserId(undefined); return; }
    setUserId(u.id);
    setPage(1);
  };

  const categoryLabel = (key: string) => categories.find((c) => c.key === key)?.label ?? key;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openDetail = async (t: SupportTicket) => {
    setMsg(null);
    try {
      const res = await api.adminGetTicket(t.id);
      setDetail(res);
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
    }
  };

  const sendReply = async () => {
    if (!detail) return;
    if (!reply.trim()) { setMsg({ kind: 'err', text: '请输入回复内容' }); return; }
    setBusy(true);
    try {
      await api.adminReplyTicket(detail.ticket.id, reply.trim());
      setReply('');
      await openDetail(detail.ticket);
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: String(e) });
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
      setMsg({ kind: 'err', text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const canReply = detail ? !['resolved', 'closed'].includes(detail.ticket.status) : false;
  const nextStatuses: SupportStatus[] = detail ? (SUPPORT_STATUS_TRANSITIONS[detail.ticket.status] ?? []) : [];

  return (
    <section className="card">
      <h2>🎫 工单/客服</h2>

      <div className="row">
        <label>状态</label>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">全部</option>
          {Object.entries(SUPPORT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label>分类</label>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">全部</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <label>使用者名</label>
        <input
          className="wide"
          placeholder="按用户名筛选（回车应用）"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') applyUserName(); }}
          style={{ maxWidth: 200 }}
        />
        <button onClick={applyUserName} className="ghost small">筛选</button>
        <button onClick={refresh} className="ghost small">↻ 刷新</button>
      </div>

      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

      <table>
        <thead>
          <tr>
            <th>id</th><th>用户</th><th>主题</th><th>分类</th><th>优先级</th>
            <th>状态</th><th>创建时间</th><th>更新时间</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td className="mono">#{t.id}</td>
              <td>{t.user_name ?? `#${t.user_id}`}</td>
              <td>{t.subject}</td>
              <td>{categoryLabel(t.category)}</td>
              <td>{SUPPORT_PRIORITY_LABELS[t.priority] ?? t.priority}</td>
              <td><span className={`badge ${t.status}`}>{SUPPORT_STATUS_LABELS[t.status] ?? t.status}</span></td>
              <td className="mono">{fmtTime(t.created_at)}</td>
              <td className="mono">{fmtTime(t.updated_at)}</td>
              <td><button className="ghost small" onClick={() => openDetail(t)}>詳情</button></td>
            </tr>
          ))}
          {tickets.length === 0 && (
            <tr><td colSpan={9} className="muted">暂无工单</td></tr>
          )}
        </tbody>
      </table>

      <div className="row">
        <button className="ghost small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← 上一页</button>
        <span className="muted">第 {page} / {totalPages} 页 · 共 {total} 条</span>
        <button className="ghost small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页 →</button>
      </div>

      {detail && (
        <div style={{ marginTop: 16, borderTop: '1px solid #26304d', paddingTop: 16 }}>
          <h3>工单 #{detail.ticket.id} · {detail.ticket.subject}
            <span className={`badge ${detail.ticket.status}`} style={{ marginLeft: 8 }}>
              {SUPPORT_STATUS_LABELS[detail.ticket.status] ?? detail.ticket.status}
            </span>
          </h3>
          <div className="muted" style={{ marginBottom: 12 }}>
            {detail.ticket.user_name ?? `#${detail.ticket.user_id}`} · {categoryLabel(detail.ticket.category)} · 优先级 {SUPPORT_PRIORITY_LABELS[detail.ticket.priority] ?? detail.ticket.priority} · 创建 {fmtTime(detail.ticket.created_at)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <div style={{ alignSelf: 'flex-start', maxWidth: '80%', background: '#0f1420', border: '1px solid #26304d', borderRadius: 10, padding: '8px 12px' }}>
              <div className="muted" style={{ marginBottom: 4 }}>🧑 用户（工单内容）</div>
              {detail.ticket.body}
            </div>
            {detail.messages.map((m) => {
              const isAgent = m.author_role === 'agent';
              return (
                <div key={m.id} style={{ alignSelf: isAgent ? 'flex-end' : 'flex-start', maxWidth: '80%', background: isAgent ? '#1f3a1f' : '#0f1420', border: isAgent ? '1px solid #1f6b3d' : '1px solid #26304d', borderRadius: 10, padding: '8px 12px' }}>
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
              <input className="wide" placeholder="回复用户…" value={reply} onChange={(e) => setReply(e.target.value)} />
              <button onClick={sendReply} disabled={busy}>发送回复</button>
            </div>
          )}

          <div className="row">
            <span className="muted">变更状态：</span>
            {nextStatuses.length === 0
              ? <span className="muted">（工单已完结）</span>
              : nextStatuses.map((s) => (
                  <button key={s} className="ghost small" onClick={() => changeStatus(s)} disabled={busy}>
                    → {SUPPORT_STATUS_LABELS[s] ?? s}
                  </button>
                ))}
            <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={() => setDetail(null)}>← 返回列表</button>
          </div>
        </div>
      )}
    </section>
  );
}
