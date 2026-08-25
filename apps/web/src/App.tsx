import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken } from '@betting/core';
import type { Bet, Market, Match, SettleResponse, User, SupportCategory, SupportMessage, SupportStatus, SupportTicket } from '@betting/core';
import { MATCH_STATUS_LABELS, SEL_LABELS, TYPE_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_PRIORITY_LABELS, SUPPORT_STATUS_TRANSITIONS } from '@betting/core';

interface Msg { kind: 'ok' | 'err'; text: string }

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
}

function fmtKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = diffMs / 3600000;
  const time = d.toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (diffMs > 0 && diffH < 24) {
    const h = Math.floor(diffH);
    const m = Math.floor((diffH - h) * 60);
    return `${time}（${h > 0 ? h + '时' : ''}${m > 0 ? m + '分' : ''}后）`;
  }
  return time;
}

/* ==================== Admin Login Bar ==================== */

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
    } catch { /* ignore */ }
  }, []);

  const login = async () => {
    try {
      const res = await api.login(name.trim(), pw);
      setAuthToken(res.token);
      try {
        localStorage.setItem('betting.token', res.token);
        localStorage.setItem('betting.role', res.user.role ?? 'user');
      } catch { /* ignore */ }
      setToken(res.token);
      onRole(res.user.role ?? 'user');
      setMsg({ kind: 'ok', text: `✅ ${res.user.name}（${res.user.role}）` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const logout = () => {
    setAuthToken(null);
    setToken(null);
    try { localStorage.removeItem('betting.token'); localStorage.removeItem('betting.role'); } catch { /* ignore */ }
    onRole('');
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', fontSize: 12 }}>
      {token ? (
        <>
          <span style={{ color: '#4ade80' }}>🔐 {name}</span>
          <button onClick={logout} className="ghost small">退出</button>
        </>
      ) : (
        <>
          <input placeholder="用户" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 80, padding: '4px 8px', fontSize: 12 }} />
          <input placeholder="密码" type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ width: 80, padding: '4px 8px', fontSize: 12 }} />
          <button onClick={login} className="small">登录</button>
        </>
      )}
      {msg && <span style={{ color: msg.kind === 'ok' ? '#4ade80' : '#f87171', fontSize: 12 }}>{msg.text}</span>}
    </div>
  );
}

/* ==================== 赛事大厅（重设计） ==================== */

const SPORT_EMOJI: Record<string, string> = {
  soccer: '⚽', basketball: '🏀', tennis: '🎾', baseball: '⚾', american_football: '🏈', hockey: '🏒',
};

function sportLabel(sport: string): string {
  return `${SPORT_EMOJI[sport] ?? '🏆'} ${sport === 'other' ? '其他' : sport}`;
}

const STATUS_FILTERS: Array<[string, string]> = [
  ['', '全部'], ['scheduled', '未开始'], ['in_progress', '进行中'], ['finished', '已结束'], ['settled', '已结算'],
];

const WHEN_FILTERS: Array<['all' | 'today' | '3d' | '7d', string]> = [
  ['all', '全部'], ['today', '今天'], ['3d', '近3天'], ['7d', '近7天'],
];

function MatchesExplorer() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [q, setQ] = useState('');
  const [sport, setSport] = useState('');
  const [league, setLeague] = useState('');
  const [status, setStatus] = useState('');
  const [when, setWhen] = useState<'all' | 'today' | '3d' | '7d'>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loadedAt, setLoadedAt] = useState<string>('');
  const [msg, setMsg] = useState<Msg | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listMatches();
      setMatches(res.matches);
      setLoadedAt(new Date().toISOString());
      setMsg(null);
    } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const normSport = useCallback((m: Match) => m.sport?.trim().toLowerCase() || 'other', []);
  const normLeague = useCallback((m: Match) => m.league?.trim() || '', []);

  const sports = useMemo(() => Array.from(new Set(matches.map(normSport))).sort(), [matches, normSport]);

  const sportCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of matches) map.set(normSport(m), (map.get(normSport(m)) ?? 0) + 1);
    return map;
  }, [matches, normSport]);

  const leagues = useMemo(
    () => Array.from(new Set(matches.filter((m) => !sport || normSport(m) === sport).map(normLeague).filter(Boolean))).sort(),
    [matches, sport, normSport, normLeague]
  );

  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const days = when === 'today' ? 1 : when === '3d' ? 3 : when === '7d' ? 7 : 0;

    const filtered = matches.filter((m) => {
      if (sport && normSport(m) !== sport) return false;
      if (league && normLeague(m) !== league) return false;
      if (status && m.status !== status) return false;
      if (kw && !`${m.home_team} ${m.away_team}`.toLowerCase().includes(kw)) return false;
      if (days > 0) {
        const t = new Date(m.kickoff_time).getTime();
        if (!Number.isNaN(t) && (t < startMs || t >= startMs + days * 86400000)) return false;
      }
      return true;
    });

    const map = new Map<string, { key: string; sport: string; league: string; items: Match[] }>();
    for (const m of filtered) {
      const s = normSport(m);
      const l = normLeague(m) || '未分类联赛';
      const key = `${s}||${l}`;
      let g = map.get(key);
      if (!g) { g = { key, sport: s, league: l, items: [] }; map.set(key, g); }
      g.items.push(m);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.sport.localeCompare(b.sport) || a.league.localeCompare(b.league));
  }, [matches, q, sport, league, status, when, normSport, normLeague]);

  const totalCount = groups.reduce((n, g) => n + g.items.length, 0);
  const liveCount = matches.filter((m) => m.status === 'in_progress' || m.status === 'open').length;

  return (
    <div>
      {/* Sport Pills */}
      <div className="sport-pills">
        <button className={`sport-pill ${sport === '' ? 'active' : ''}`} onClick={() => { setSport(''); setLeague(''); }}>
          全部 <span className="pill-count">{matches.length}</span>
        </button>
        {sports.map((s) => (
          <button key={s} className={`sport-pill ${sport === s ? 'active' : ''}`} onClick={() => { setSport(s); setLeague(''); }}>
            {sportLabel(s)} <span className="pill-count">{sportCounts.get(s) ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="stats-bar">
        <span>共 <span className="stat-num">{totalCount}</span> 场</span>
        {liveCount > 0 && <span style={{ color: '#4ade80' }}>🔴 <span className="stat-num">{liveCount}</span> 进行中</span>}
        {loadedAt && <span style={{ marginLeft: 'auto' }}>更新于 {fmtTime(loadedAt)}</span>}
      </div>

      {/* Search + Filters */}
      <div className="search-bar">
        <input placeholder="🔍 搜索队名..." value={q} onChange={(e) => setQ(e.target.value)} />
        {leagues.length > 0 && (
          <select value={league} onChange={(e) => setLeague(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="">全部联赛</option>
            {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <button onClick={refresh} className="ghost small">↻</button>
      </div>

      <div className="filter-row">
        <span className="filter-label">状态</span>
        {STATUS_FILTERS.map(([v, label]) => (
          <button key={v || 'all'} className={`filter-chip ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>
            {label}
          </button>
        ))}
        <span className="filter-label" style={{ marginLeft: 8 }}>时间</span>
        {WHEN_FILTERS.map(([v, label]) => (
          <button key={v} className={`filter-chip ${when === v ? 'active' : ''}`} onClick={() => setWhen(v)}>
            {label}
          </button>
        ))}
      </div>

      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      {!msg && totalCount === 0 && <div className="muted" style={{ margin: '20px 0', textAlign: 'center' }}>没有符合条件的赛事</div>}

      {/* Match Groups */}
      {groups.map((g) => {
        const isOpen = !collapsed[g.key];
        return (
          <div key={g.key} className="match-group">
            <button className="match-group-head" onClick={() => setCollapsed((c) => ({ ...c, [g.key]: isOpen }))}>
              <span>
                <span className="group-arrow" style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                {sportLabel(g.sport)} · {g.league}
              </span>
              <span className="group-count">{g.items.length} 场</span>
            </button>
            {isOpen && g.items.map((m) => (
              <div key={m.id} className="match-card">
                <div className="match-card-top">
                  <span className="match-teams">{m.home_team} vs {m.away_team}</span>
                  <span className="match-id">#{m.id}</span>
                </div>
                <div className="match-meta">
                  <span>{fmtKickoff(m.kickoff_time)}</span>
                  <span className={`badge ${m.status}`}>{MATCH_STATUS_LABELS[m.status] ?? m.status}</span>
                  {m.home_score != null && <span style={{ fontWeight: 700, color: '#e8ecf4' }}>{m.home_score} : {m.away_score}</span>}
                </div>
                {m.markets.length > 0 && (
                  <div className="match-odds">
                    {m.markets.map((mk) => (
                      mk.odds.map((o) => (
                        <span key={`${mk.id}-${o.selection}`} className="odds-chip">
                          {SEL_LABELS[o.selection] ?? o.selection} {o.price}
                        </span>
                      ))
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ==================== 账户 ==================== */

function AccountsPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [selId, setSelId] = useState<number | ''>('');
  const [user, setUser] = useState<User | null>(null);
  const [deposit, setDeposit] = useState('1000');
  const [msg, setMsg] = useState<Msg | null>(null);

  const refreshUsers = useCallback(async () => {
    try { const res = await api.listUsers(); setUsers(res.users); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  }, []);
  useEffect(() => { refreshUsers(); }, [refreshUsers]);

  const loadUser = async (id: number) => {
    try { const res = await api.getUser(id); setUser(res.user); setMsg(null); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  };

  const createUser = async () => {
    if (!name.trim()) { setMsg({ kind: 'err', text: '请输入用户名' }); return; }
    try {
      const res = await api.createUser(name.trim());
      setMsg({ kind: 'ok', text: `创建成功：#${res.user.id} ${res.user.name}` });
      setName(''); await refreshUsers(); setSelId(res.user.id); setUser(res.user);
    } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  };

  const doDeposit = async () => {
    if (selId === '') { setMsg({ kind: 'err', text: '先选择用户' }); return; }
    const amt = Number(deposit);
    if (!(amt > 0)) { setMsg({ kind: 'err', text: '金额必须大于 0' }); return; }
    try { const res = await api.deposit(Number(selId), amt); setMsg({ kind: 'ok', text: `充值成功：余额 → ${res.account.balance}` }); await loadUser(Number(selId)); await refreshUsers(); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  };

  return (
    <section className="card">
      <h2>👤 账户</h2>
      <div className="row">
        <input className="wide" placeholder="新用户名" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={createUser}>创建</button>
      </div>
      <div className="row">
        <select value={selId} onChange={(e) => { const v = e.target.value; setSelId(v === '' ? '' : Number(v)); if (v !== '') loadUser(Number(v)); }}>
          <option value="">选择用户</option>
          {users.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.name}</option>)}
        </select>
        <input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} min="1" />
        <button onClick={doDeposit} className="ghost">充值</button>
      </div>
      {user && <div className="row"><span className="muted">#{user.id} {user.name}</span><span className="balance">¥{user.balance}</span></div>}
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

/* ==================== 赛事+市场管理（Admin） ==================== */

function MatchesAdminPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [home, setHome] = useState('Arsenal');
  const [away, setAway] = useState('Chelsea');
  const [kickoff, setKickoff] = useState('2026-08-20T15:00');
  const [sport, setSport] = useState('');
  const [league, setLeague] = useState('');
  const [msg, setMsg] = useState<Msg | null>(null);
  const [mktMatch, setMktMatch] = useState<number | ''>('');
  const [mktType, setMktType] = useState<'1x2' | 'ah' | 'ou'>('1x2');
  const [mktLine, setMktLine] = useState('-1.5');
  const [oddsA, setOddsA] = useState('2.1');
  const [oddsB, setOddsB] = useState('3.4');
  const [oddsC, setOddsC] = useState('3.2');

  const refresh = useCallback(async () => {
    try { const res = await api.listMatches(); setMatches(res.matches); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const createMatch = async () => {
    if (!home.trim() || !away.trim()) { setMsg({ kind: 'err', text: '主客队名必填' }); return; }
    try { const res = await api.createMatch(home.trim(), away.trim(), new Date(kickoff).toISOString(), sport || undefined, league || undefined); setMsg({ kind: 'ok', text: `创建成功：#${res.match.id}` }); await refresh(); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  };

  const createMarket = async () => {
    if (mktMatch === '') { setMsg({ kind: 'err', text: '先选择赛事' }); return; }
    let line: number | null = null;
    if (mktType !== '1x2') { line = Number(mktLine); if (!Number.isFinite(line) || line === 0) { setMsg({ kind: 'err', text: 'line 必须是非 0 数字' }); return; } }
    const a = Number(oddsA); const b = Number(oddsB);
    if (!(a > 1) || !(b > 1)) { setMsg({ kind: 'err', text: '赔率必须大于 1' }); return; }
    let odds: Record<string, number>;
    if (mktType === '1x2') { const c = Number(oddsC); if (!(c > 1)) { setMsg({ kind: 'err', text: '赔率必须大于 1' }); return; } odds = { home: a, draw: b, away: c }; }
    else if (mktType === 'ah') { odds = { home: a, away: b }; } else { odds = { over: a, under: b }; }
    try { const res = await api.createMarket(Number(mktMatch), mktType, line, odds); setMsg({ kind: 'ok', text: `市场创建成功：#${res.market.id}` }); await refresh(); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  };

  const scheduled = matches.filter((m) => m.status === 'scheduled');

  return (
    <section className="card">
      <h2>🏟️ 建赛 & 市场</h2>
      <div className="row">
        <input className="wide" value={home} onChange={(e) => setHome(e.target.value)} placeholder="主队" style={{ maxWidth: 120 }} />
        <span className="muted">vs</span>
        <input className="wide" value={away} onChange={(e) => setAway(e.target.value)} placeholder="客队" style={{ maxWidth: 120 }} />
        <input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
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
        {mktType !== '1x2' && <input type="number" step="0.25" value={mktLine} onChange={(e) => setMktLine(e.target.value)} placeholder="line" />}
        <input type="number" step="0.01" value={oddsA} onChange={(e) => setOddsA(e.target.value)} />
        <input type="number" step="0.01" value={oddsB} onChange={(e) => setOddsB(e.target.value)} />
        {mktType === '1x2' && <input type="number" step="0.01" value={oddsC} onChange={(e) => setOddsC(e.target.value)} />}
        <button onClick={createMarket} className="ghost">添加市场</button>
      </div>
      <button onClick={refresh} className="ghost small">↻ 刷新</button>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

/* ==================== 下注 ==================== */

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
    m.markets.filter((mk) => mk.status === 'open').map((mk) => ({ ...mk, match: m }))
  );

  const chosen = markets.find((mk) => mk.id === marketId);
  const odds = chosen?.odds.find((o) => o.selection === selection);
  const potential = odds && stake ? (odds.price * Number(stake)).toFixed(2) : '—';

  const submit = async () => {
    if (userId === '' || marketId === '' || !selection) { setMsg({ kind: 'err', text: '请选择用户、市场和选择' }); return; }
    const s = Number(stake);
    if (!(s > 0)) { setMsg({ kind: 'err', text: '投注额必须大于 0' }); return; }
    try { const res = await api.placeBet(Number(userId), Number(marketId), selection, s); setMsg({ kind: 'ok', text: `下注成功：#${res.bet.id}，潜在派彩 ¥${res.bet.potential_payout}` }); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  };

  return (
    <section className="card">
      <h2>🎫 下注</h2>
      <div className="row">
        <label>用户</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">选择用户</option>
          {users.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.name}（¥{u.balance}）</option>)}
        </select>
      </div>
      <div className="row">
        <label>市场</label>
        <select value={marketId} onChange={(e) => { setMarketId(e.target.value === '' ? '' : Number(e.target.value)); setSelection(''); }}>
          <option value="">选择市场</option>
          {markets.map((mk) => <option key={mk.id} value={mk.id}>#{mk.id} {mk.match.home_team} vs {mk.match.away_team} - {TYPE_LABELS[mk.type] ?? mk.type}{mk.line != null ? ` @${mk.line}` : ''}</option>)}
        </select>
      </div>
      {chosen && (
        <div className="row">
          <label>选择</label>
          {chosen.odds.map((o) => (
            <button key={o.selection} className={`ghost small ${selection === o.selection ? 'selected' : ''}`} onClick={() => setSelection(o.selection)}>
              {SEL_LABELS[o.selection] ?? o.selection} {o.price}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <label>投注额</label>
        <input type="number" value={stake} onChange={(e) => setStake(e.target.value)} min="1" style={{ width: 100 }} />
        {odds && <span className="muted">潜在派彩 ¥{potential}</span>}
      </div>
      <button onClick={submit}>提交下注</button>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

/* ==================== 投注记录 ==================== */

function BetsPanel() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<number | ''>('');
  const [msg, setMsg] = useState<Msg | null>(null);

  const refresh = useCallback(async () => {
    try { const res = await api.listBets(userId === '' ? undefined : Number(userId)); setBets(res.bets); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  }, [userId]);

  useEffect(() => { api.listUsers().then((r) => setUsers(r.users)).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <section className="card">
      <h2>📋 投注记录</h2>
      <div className="row">
        <select value={userId} onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">全部用户</option>
          {users.map((u) => <option key={u.id} value={u.id}>#{u.id} {u.name}</option>)}
        </select>
        <button onClick={refresh} className="ghost small">↻</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      <table>
        <thead>
          <tr><th>#</th><th>用户</th><th>市场</th><th>选择</th><th>金额</th><th>赔率</th><th>派彩</th><th>状态</th><th>时间</th></tr>
        </thead>
        <tbody>
          {bets.map((b) => (
            <tr key={b.id}>
              <td>{b.id}</td>
              <td>#{b.user_id}</td>
              <td className="mono">#{b.market_id}</td>
              <td>{b.selection ? (SEL_LABELS[b.selection] ?? b.selection) : '—'}</td>
              <td>{b.stake}</td>
              <td>{b.price}</td>
              <td>{b.potential_payout}</td>
              <td><span className={`badge ${b.status}`}>{b.status}</span></td>
              <td className="mono">{fmtTime(b.created_at)}</td>
            </tr>
          ))}
          {bets.length === 0 && <tr><td colSpan={9} className="muted">暂无投注记录</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

/* ==================== 结算 ==================== */

function SettlePanel() {
  const [marketId, setMarketId] = useState<number | ''>('');
  const [result, setResult] = useState('');
  const [msg, setMsg] = useState<Msg | null>(null);

  const settle = async () => {
    if (marketId === '' || !result) { setMsg({ kind: 'err', text: '请选择市场和结果' }); return; }
    try { const res: SettleResponse = await api.settleMarket(Number(marketId), result); setMsg({ kind: 'ok', text: `结算完成：${res.settled} 笔投注` }); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
  };

  return (
    <section className="card">
      <h2>💰 结算</h2>
      <div className="row">
        <input type="number" value={marketId} onChange={(e) => setMarketId(e.target.value === '' ? '' : Number(e.target.value))} placeholder="市场 ID" />
        <select value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="">选择结果</option>
          <option value="home">主胜 (home)</option>
          <option value="draw">平局 (draw)</option>
          <option value="away">客胜 (away)</option>
          <option value="over">大 (over)</option>
          <option value="under">小 (under)</option>
        </select>
        <button onClick={settle}>结算</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

/* ==================== Feed ==================== */

function FeedPanel() {
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const refresh = useCallback(async () => {
    try { const res = await api.adminFeedStatus(); setStatus(res); } catch { /* ignore */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const trigger = async () => {
    setBusy(true);
    try { await api.adminTriggerFeed(); setMsg({ kind: 'ok', text: 'Feed 拉取已触发' }); await refresh(); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
    finally { setBusy(false); }
  };

  return (
    <section className="card">
      <h2>📡 Feed</h2>
      <div className="row">
        <button onClick={trigger} disabled={busy}>手动拉取</button>
        <button onClick={refresh} className="ghost small">↻</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      <h3>最近拉取</h3>
      <table>
        <thead><tr><th>时间</th><th>状态</th><th>seen</th><th>upserted</th><th>errors</th></tr></thead>
        <tbody>
          {(status?.feedLog ?? []).map((l: any) => (
            <tr key={l.id}>
              <td className="mono">{fmtTime(l.requested_at)}</td>
              <td><span className={`badge ${l.status === 'ok' ? 'open' : 'settled'}`}>{l.status ?? '—'}</span></td>
              <td>{l.matches_seen ?? 0}</td>
              <td>{l.matches_upserted ?? 0}</td>
              <td className="mono">{l.errors ?? '—'}</td>
            </tr>
          ))}
          {(status?.feedLog ?? []).length === 0 && <tr><td colSpan={5} className="muted">暂无记录</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

/* ==================== 工单/客服 ==================== */

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
    try { const res = await api.adminListTickets({ status: status || undefined, category: category || undefined, userId, page, pageSize: PAGE_SIZE }); setTickets(res.tickets); setTotal(res.total); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
    finally { setBusy(false); }
  }, [status, category, userId, page]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { api.listSupportCategories().then((r) => setCategories(r.categories)).catch(() => {}); api.listUsers().then((r) => setUsers(r.users)).catch(() => {}); }, []);

  const categoryLabel = (key: string) => categories.find((c) => c.key === key)?.label ?? key;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openDetail = async (t: SupportTicket) => { setMsg(null); try { const res = await api.adminGetTicket(t.id); setDetail(res); } catch (e) { setMsg({ kind: 'err', text: String(e) }); } };

  const sendReply = async () => {
    if (!detail || !reply.trim()) { setMsg({ kind: 'err', text: '请输入回复内容' }); return; }
    setBusy(true);
    try { await api.adminReplyTicket(detail.ticket.id, reply.trim()); setReply(''); await openDetail(detail.ticket); await refresh(); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
    finally { setBusy(false); }
  };

  const changeStatus = async (target: SupportStatus) => {
    if (!detail) return;
    setBusy(true);
    try { await api.adminSetTicketStatus(detail.ticket.id, target); await openDetail(detail.ticket); await refresh(); } catch (e) { setMsg({ kind: 'err', text: String(e) }); }
    finally { setBusy(false); }
  };

  const canReply = detail ? !['resolved', 'closed'].includes(detail.ticket.status) : false;
  const nextStatuses: SupportStatus[] = detail ? (SUPPORT_STATUS_TRANSITIONS[detail.ticket.status] ?? []) : [];

  return (
    <section className="card">
      <h2>🎫 工单/客服</h2>
      <div className="row">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">全部状态</option>
          {Object.entries(SUPPORT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">全部分类</option>
          {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input placeholder="用户名" value={userName} onChange={(e) => setUserName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const u = users.find((x) => x.name === userName.trim()); setUserId(u?.id); setPage(1); } }} style={{ maxWidth: 120 }} />
        <button onClick={refresh} className="ghost small">↻</button>
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      <table>
        <thead><tr><th>#</th><th>用户</th><th>主题</th><th>状态</th><th>时间</th><th></th></tr></thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td className="mono">#{t.id}</td>
              <td>{t.user_name ?? `#${t.user_id}`}</td>
              <td>{t.subject}</td>
              <td><span className={`badge ${t.status}`}>{SUPPORT_STATUS_LABELS[t.status] ?? t.status}</span></td>
              <td className="mono">{fmtTime(t.created_at)}</td>
              <td><button className="ghost small" onClick={() => openDetail(t)}>详情</button></td>
            </tr>
          ))}
          {tickets.length === 0 && <tr><td colSpan={6} className="muted">暂无工单</td></tr>}
        </tbody>
      </table>
      <div className="row">
        <button className="ghost small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>←</button>
        <span className="muted">{page}/{totalPages} · {total}条</span>
        <button className="ghost small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
      </div>
      {detail && (
        <div style={{ marginTop: 16, borderTop: '1px solid #26304d', paddingTop: 16 }}>
          <h3>#{detail.ticket.id} · {detail.ticket.subject} <span className={`badge ${detail.ticket.status}`}>{SUPPORT_STATUS_LABELS[detail.ticket.status]}</span></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
            <div style={{ maxWidth: '80%', background: '#0f1420', border: '1px solid #26304d', borderRadius: 10, padding: '8px 12px' }}>
              <div className="muted" style={{ marginBottom: 4 }}>🧑 用户</div>{detail.ticket.body}
            </div>
            {detail.messages.map((m) => {
              const isAgent = m.author_role === 'agent';
              return (
                <div key={m.id} style={{ alignSelf: isAgent ? 'flex-end' : 'flex-start', maxWidth: '80%', background: isAgent ? '#1f3a1f' : '#0f1420', border: isAgent ? '1px solid #1f6b3d' : '1px solid #26304d', borderRadius: 10, padding: '8px 12px' }}>
                  <div className="muted" style={{ marginBottom: 4 }}>{isAgent ? '🛠 客服' : '🧑 用户'} · {fmtTime(m.created_at)}</div>{m.content}
                </div>
              );
            })}
          </div>
          {canReply && (
            <div className="row">
              <input className="wide" placeholder="回复..." value={reply} onChange={(e) => setReply(e.target.value)} />
              <button onClick={sendReply} disabled={busy}>发送</button>
            </div>
          )}
          <div className="row">
            {nextStatuses.map((s) => <button key={s} className="ghost small" onClick={() => changeStatus(s)} disabled={busy}>→ {SUPPORT_STATUS_LABELS[s]}</button>)}
            <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={() => setDetail(null)}>← 返回</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ==================== App（Tab 导航） ==================== */

type TabId = 'lobby' | 'bet' | 'records' | 'admin';

export default function App() {
  const [role, setRole] = useState('');
  const [tab, setTab] = useState<TabId>('lobby');
  const isSupport = role === 'admin' || role === 'support';

  const tabs: Array<{ id: TabId; icon: string; label: string; adminOnly?: boolean }> = [
    { id: 'lobby', icon: '🏠', label: '大厅' },
    { id: 'bet', icon: '🎫', label: '下注' },
    { id: 'records', icon: '📋', label: '投注记录' },
    { id: 'admin', icon: '⚙️', label: '管理', adminOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isSupport);

  return (
    <>
      <header className="top">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1>⚽ 投注系统</h1>
          <span className="sub">赛前固定赔率 · 下注 · 结算</span>
        </div>
        <AdminLoginBar onRole={setRole} />
      </header>
      <nav className="tab-bar">
        {visibleTabs.map((t) => (
          <button key={t.id} className={`tab-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tab-content">
        {tab === 'lobby' && <MatchesExplorer />}
        {tab === 'bet' && <BettingPanel />}
        {tab === 'records' && <BetsPanel />}
        {tab === 'admin' && isSupport && (
          <>
            <div className="grid">
              <AccountsPanel />
              <MatchesAdminPanel />
            </div>
            <div className="grid">
              <SettlePanel />
              <FeedPanel />
            </div>
            <SupportPanel />
          </>
        )}
      </div>
    </>
  );
}
