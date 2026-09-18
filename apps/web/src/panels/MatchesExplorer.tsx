// panels/MatchesExplorer.tsx — 赛事大厅（公开页）
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  api,
  MATCH_STATUS_LABELS,
  SEL_LABELS,
  type Match,
  type Market,
  type OddsItem,
} from '@betting/core';
import { SkeletonList } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { MatchDetail } from '../components/MatchDetail.js';
import { LeagueChip } from '../components/LeagueChip.js';
import { useVirtualScroll } from '../hooks/useVirtualScroll.js';
import { useAuth, toast } from '../store.js';

const SPORT_EMOJI: Record<string, string> = {
  soccer: '⚽', basketball: '🏀', tennis: '🎾', baseball: '⚾',
  american_football: '🏈', hockey: '🏒',
};
function sportLabel(s: string): string {
  return `${SPORT_EMOJI[s] ?? '🏆'} ${s === 'other' ? '其他' : s}`;
}

const STATUS_FILTERS: Array<[string, string]> = [
  ['', '全部'], ['scheduled', '未开始'], ['in_progress', '进行中'], ['finished', '已结束'], ['settled', '已结算'],
];
const WHEN_FILTERS: Array<['all' | 'today' | '3d' | '7d', string]> = [
  ['all', '全部'], ['today', '今天'], ['3d', '近3天'], ['7d', '近7天'],
];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
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

interface Props {
  onPick: (m: Match, mk: Market, o: OddsItem) => void;
  pickedKeys: Set<string>;
}

export function MatchesExplorer({ onPick, pickedKeys }: Props) {
  const user = useAuth((s: { user: import('@betting/core').User | null }) => s.user);
  const loggedIn = !!user;
  const [matches, setMatches] = useState<Match[]>([]);
  const [q, setQ] = useState('');
  const [sport, setSport] = useState('');
  const [sports, setSports] = useState<string[]>([]);          // multi-sport (A6)
  const [league, setLeague] = useState('');
  const [leagueQ, setLeagueQ] = useState('');                  // 联赛搜索 (A6)
  const [status, setStatus] = useState('');
  const [when, setWhen] = useState<'all' | 'today' | '3d' | '7d'>('all');
  const [onlyWithOdds, setOnlyWithOdds] = useState(false);     // 仅开盘 (A6)
  const [presets, setPresets] = useState<{ name: string; filter: string }[]>([]);
  const [presetName, setPresetName] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loadedAt, setLoadedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const virtualViewportRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listMatches();
      setMatches(res.matches);
      setLoadedAt(new Date().toISOString());
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Load saved filter presets (Sprint 2 A6)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('mexplorer.presets');
      if (raw) setPresets(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const normSport = useCallback((m: Match) => m.sport?.trim().toLowerCase() || 'other', []);
  const normLeague = useCallback((m: Match) => m.league?.trim() || '', []);
  const allSports = useMemo(() => Array.from(new Set(matches.map(normSport))).sort(), [matches, normSport]);
  const sportCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of matches) map.set(normSport(m), (map.get(normSport(m)) ?? 0) + 1);
    return map;
  }, [matches, normSport]);
  const leagues = useMemo(
    () => Array.from(new Set(matches.map(normLeague).filter(Boolean))).sort(),
    [matches, normLeague],
  );

  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const days = when === 'today' ? 1 : when === '3d' ? 3 : when === '7d' ? 7 : 0;
    const filtered = matches.filter((m) => {
      if (sport && normSport(m) !== sport) return false;
      if (sports.length > 0 && !sports.includes(normSport(m))) return false;
      if (league && normLeague(m) !== league) return false;
      if (status && m.status !== status) return false;
      if (kw && !`${m.home_team} ${m.away_team}`.toLowerCase().includes(kw)) return false;
      if (days > 0) {
        const t = new Date(m.kickoff_time).getTime();
        if (!Number.isNaN(t) && (t < startMs || t >= startMs + days * 86400000)) return false;
      }
      if (onlyWithOdds && !m.markets.some((mk) => mk.status === 'open' && mk.odds.length > 0)) return false;
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
  }, [matches, q, sport, sports, league, status, when, onlyWithOdds, normSport, normLeague]);

  // 联赛搜索 (A6)
  const filteredLeagues = useMemo(() => {
    const lq = leagueQ.trim().toLowerCase();
    if (!lq) return leagues;
    return leagues.filter((l) => l.toLowerCase().includes(lq));
  }, [leagues, leagueQ]);

  const snapshot = useCallback(
    () => JSON.stringify({ q, sport, sports, league, status, when, onlyWithOdds }),
    [q, sport, sports, league, status, when, onlyWithOdds],
  );

  const savePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) return;
    const next = presets.filter((p) => p.name !== name).concat({ name, filter: snapshot() });
    setPresets(next);
    try { localStorage.setItem('mexplorer.presets', JSON.stringify(next)); } catch { /* ignore */ }
    setPresetName('');
    toast.ok(`已保存筛选预设: ${name}`);
  }, [presetName, presets, snapshot]);

  const loadPreset = useCallback(
    (f: string) => {
      try {
        const p = JSON.parse(f) as {
          q?: string; sport?: string; sports?: string[]; league?: string;
          status?: string; when?: 'all' | 'today' | '3d' | '7d'; onlyWithOdds?: boolean;
        };
        setQ(p.q ?? '');
        setSport(p.sport ?? '');
        setSports(p.sports ?? []);
        setLeague(p.league ?? '');
        setStatus(p.status ?? '');
        setWhen(p.when ?? 'all');
        setOnlyWithOdds(!!p.onlyWithOdds);
        toast.info('已加载预设');
      } catch { toast.err('预设解析失败'); }
    }, []);

  const delPreset = useCallback((name: string) => {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    try { localStorage.setItem('mexplorer.presets', JSON.stringify(next)); } catch { /* ignore */ }
  }, [presets]);

  const hasActiveFilter = !!(q || sport || sports.length || league || status || when !== 'all' || onlyWithOdds);
  const clearAll = useCallback(() => {
    setQ(''); setSport(''); setSports([]); setLeague(''); setStatus(''); setWhen('all'); setOnlyWithOdds(false); setLeagueQ('');
  }, []);

  const totalCount = groups.reduce((n, g) => n + g.items.length, 0);

  // #2 虚拟滚动: 平铺所有 matches 用虚拟列表
  const flatMatches = useMemo(() => {
    const out: Match[] = [];
    for (const g of groups) {
      // 按 collapsed 状态决定是否包含
      if (!collapsed[g.key]) {
        for (const m of g.items) out.push(m);
      }
    }
    return out;
  }, [groups, collapsed]);

  const { visible: visibleMatches, totalHeight: virtualHeight, useVirtual } = useVirtualScroll({
    items: flatMatches,
    parentRef: virtualViewportRef,
    itemHeight: 96,         // 每 match ~ 96px
    overscan: 4,
    threshold: 40,
  });
  const liveCount = matches.filter((m) => m.status === 'in_progress' || m.status === 'open').length;

  return (
    <div>
      {/* Sport pills (multi-select: A6) */}
      <div className="row" style={{ marginBottom: 12 }}>
        <button
          className={`odds-chip ${sports.length === 0 && !sport ? 'selected' : ''}`}
          onClick={() => { setSports([]); setSport(''); setLeague(''); }}
        >
          全部 ({matches.length})
        </button>
        {sports.map((s) => (
          <button
            key={s}
            className="odds-chip selected"
            onClick={() => setSports(sports.filter((x) => x !== s))}
            title="点此移除"
          >
            {sportLabel(s)} ✕
          </button>
        ))}
        {sports.length === 0 && allSports.map((s) => (
          <button
            key={s}
            className={`odds-chip ${sport === s ? 'selected' : ''}`}
            onClick={() => { setSport(s); setLeague(''); }}
          >
            {sportLabel(s)} ({sportCounts.get(s) ?? 0})
          </button>
        ))}
      </div>

      {/* Stats + 仅开盘 toggle (A6) */}
      <div className="row" style={{ marginBottom: 12 }}>
        <span>共 <strong>{totalCount}</strong> 场</span>
        {liveCount > 0 && <span style={{ color: 'var(--success)' }}>🔴 <strong>{liveCount}</strong> 进行中</span>}
        <label className="only-with-odds" title="仅显示有可下注赔率的赛事">
          <input type="checkbox" checked={onlyWithOdds} onChange={(e) => setOnlyWithOdds(e.target.checked)} />
          <span>仅开盘</span>
        </label>
        {loadedAt && <span className="muted" style={{ marginLeft: 'auto' }}>更新于 {fmtTime(loadedAt)}</span>}
      </div>

      {/* Active filter chips (A6) */}
      {hasActiveFilter && (
        <div className="row" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
          <span className="muted" style={{ fontSize: 11 }}>活动筛选:</span>
          {q && <span className="active-chip" onClick={() => setQ('')}>🔍 "{q}" ✕</span>}
          {sport && <span className="active-chip" onClick={() => setSport('')}>{sportLabel(sport)} ✕</span>}
          {sports.map((s) => (
            <span key={s} className="active-chip" onClick={() => setSports(sports.filter((x) => x !== s))}>{sportLabel(s)} ✕</span>
          ))}
          {league && <span className="active-chip" onClick={() => setLeague('')}>📋 {league} ✕</span>}
          {status && <span className="active-chip" onClick={() => setStatus('')}>{status} ✕</span>}
          {when !== 'all' && <span className="active-chip" onClick={() => setWhen('all')}>🕐 {when === 'today' ? '今天' : when === '3d' ? '近3天' : '近7天'} ✕</span>}
          {onlyWithOdds && <span className="active-chip" onClick={() => setOnlyWithOdds(false)}>✅ 仅开盘 ✕</span>}
          <button className="ghost small" onClick={clearAll}>全部清除</button>
        </div>
      )}

      {/* Presets (A6) */}
      <div className="row" style={{ marginBottom: 12, gap: 6, flexWrap: 'wrap' }}>
        {presets.map((p) => (
          <span key={p.name} className="preset-chip">
            <button onClick={() => loadPreset(p.filter)} title="加载此预设">📂 {p.name}</button>
            <button onClick={() => delPreset(p.name)} title="删除" className="ghost small">✕</button>
          </span>
        ))}
        <input
          placeholder="💾 保存当前筛选..."
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); }}
          style={{ maxWidth: 200 }}
        />
        <button onClick={savePreset} disabled={!presetName.trim()} className="ghost small">保存</button>
      </div>

      {/* Search + league (A6: league 搜索 input) */}
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="wide" placeholder="🔍 搜索队名..." value={q} onChange={(e) => setQ(e.target.value)} />
        {leagues.length > 0 && (
          <div className="league-search">
            <input
              placeholder="🔎 联赛"
              value={leagueQ}
              onChange={(e) => setLeagueQ(e.target.value)}
              style={{ maxWidth: 140 }}
            />
            <select value={league} onChange={(e) => setLeague(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="">全部联赛 ({filteredLeagues.length})</option>
              {filteredLeagues.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}
        <button onClick={() => void refresh()} className="ghost small">↻ 刷新</button>
      </div>

      {/* Status / When filters */}
      <div className="row">
        <span className="muted">状态</span>
        {STATUS_FILTERS.map(([v, label]) => (
          <button key={v || 'all'} className={`odds-chip ${status === v ? 'selected' : ''}`} onClick={() => setStatus(v)}>{label}</button>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted">时间</span>
        {WHEN_FILTERS.map(([v, label]) => (
          <button key={v} className={`odds-chip ${when === v ? 'selected' : ''}`} onClick={() => setWhen(v)}>{label}</button>
        ))}
      </div>

      {/* Body */}
      {loading && <SkeletonList rows={4} />}
      {!loading && totalCount === 0 && (
        <EmptyState
          icon="🔍"
          title="没有符合条件的赛事"
          desc="尝试换个状态或时间范围"
          action={<button onClick={() => { setQ(''); setSport(''); setLeague(''); setStatus(''); setWhen('all'); }}>重置筛选</button>}
        />
      )}
      {!loading && totalCount > 0 && useVirtual ? (
        <div ref={virtualViewportRef} className="virtual-viewport">
          <div style={{ height: virtualHeight, position: 'relative' }}>
            <div className="virtual-badge">共 {flatMatches.length} 场 (虚拟滚动中)</div>
            {visibleMatches.map(({ item: m, offsetTop }) => (
              <div key={m.id} className="virtual-item" style={{ top: offsetTop, height: 96, padding: '6px 0' }}>
                <div className="card fade-in">
                  <div className="row">
                    <button className="md-team-btn" onClick={() => setDetailMatch(m)} title="查看详情">
                      <strong>{m.home_team} vs {m.away_team}</strong>
                    </button>
                    <span className="muted">#{m.id}</span>
                    <span className="muted">{fmtKickoff(m.kickoff_time)}</span>
                    <span className={`badge ${m.status}`}>{MATCH_STATUS_LABELS[m.status] ?? m.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !loading && totalCount > 0 && groups.map((g) => {
        const isOpen = !collapsed[g.key];
        return (
          <div key={g.key} className="card fade-in" style={{ marginBottom: 12 }}>
            <button className="ghost small" style={{ width: '100%', textAlign: 'left' }} onClick={() => setCollapsed((c) => ({ ...c, [g.key]: isOpen }))}>
                {isOpen ? '▼' : '▶'} {sportLabel(g.sport)} <LeagueChip league={g.league} size="xs" />
            </button>
            {isOpen && g.items.map((m) => (
              <div key={m.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
                <div className="row">
                  <button
                    className="md-team-btn"
                    onClick={() => setDetailMatch(m)}
                    title="查看详情"
                  >
                    <strong>{m.home_team} vs {m.away_team}</strong>
                  </button>
                  <span className="muted">#{m.id}</span>
                  <span className="muted">{fmtKickoff(m.kickoff_time)}</span>
                  <span className={`badge ${m.status}`}>{MATCH_STATUS_LABELS[m.status] ?? m.status}</span>
                  {m.home_score != null && <span className="balance-inline">{m.home_score} : {m.away_score}</span>}
                </div>
                {m.markets.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {m.markets.map((mk) =>
                      mk.odds.map((o) => {
                        const chipKey = `${mk.id}:${o.selection}`;
                        const open = mk.status === 'open';
                        return (
                          <span
                            key={`${mk.id}-${o.selection}`}
                            role="button"
                            tabIndex={0}
                            title={open ? '加入投注单' : '该市场已关闭'}
                            className={`odds-chip${pickedKeys.has(chipKey) ? ' selected' : ''}${open ? '' : ' disabled'}`}
                            style={{ cursor: open ? 'pointer' : 'not-allowed', opacity: open ? 1 : 0.5 }}
                            onClick={() => {
                              if (!loggedIn) { toast.warn('⚠️ 请先登录再下注'); return; }
                              if (!open) { toast.warn('该市场已关闭，无法下注'); return; }
                              onPick(m, mk, o);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLSpanElement).click(); } }}
                          >
                            {SEL_LABELS[o.selection] ?? o.selection} {o.price}
                          </span>
                        );
                      }),
                    )}
                  </div>
                )}
              </div>
              ))}
          </div>
          );
          })}
        <MatchDetail
          match={detailMatch}
          onClose={() => setDetailMatch(null)}
          onPick={onPick}
          loggedIn={loggedIn}
        />
      </div>
    );
  }
