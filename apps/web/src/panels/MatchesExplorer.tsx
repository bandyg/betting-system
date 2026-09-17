// panels/MatchesExplorer.tsx — 赛事大厅（公开页）
import { useEffect, useMemo, useState, useCallback } from 'react';
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
  const [league, setLeague] = useState('');
  const [status, setStatus] = useState('');
  const [when, setWhen] = useState<'all' | 'today' | '3d' | '7d'>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loadedAt, setLoadedAt] = useState<string>('');
  const [loading, setLoading] = useState(true);

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
    [matches, sport, normSport, normLeague],
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
      {/* Sport pills */}
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`odds-chip ${sport === '' ? 'selected' : ''}`} onClick={() => { setSport(''); setLeague(''); }}>
          全部 ({matches.length})
        </button>
        {sports.map((s) => (
          <button key={s} className={`odds-chip ${sport === s ? 'selected' : ''}`} onClick={() => { setSport(s); setLeague(''); }}>
            {sportLabel(s)} ({sportCounts.get(s) ?? 0})
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="row" style={{ marginBottom: 12 }}>
        <span>共 <strong>{totalCount}</strong> 场</span>
        {liveCount > 0 && <span style={{ color: 'var(--success)' }}>🔴 <strong>{liveCount}</strong> 进行中</span>}
        {loadedAt && <span className="muted" style={{ marginLeft: 'auto' }}>更新于 {fmtTime(loadedAt)}</span>}
      </div>

      {/* Search + league */}
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="wide" placeholder="🔍 搜索队名..." value={q} onChange={(e) => setQ(e.target.value)} />
        {leagues.length > 0 && (
          <select value={league} onChange={(e) => setLeague(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="">全部联赛</option>
            {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
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
      {!loading && totalCount > 0 && groups.map((g) => {
        const isOpen = !collapsed[g.key];
        return (
          <div key={g.key} className="card fade-in" style={{ marginBottom: 12 }}>
            <button className="ghost small" style={{ width: '100%', textAlign: 'left' }} onClick={() => setCollapsed((c) => ({ ...c, [g.key]: isOpen }))}>
              {isOpen ? '▼' : '▶'} {sportLabel(g.sport)} · {g.league} <span className="muted">({g.items.length} 场)</span>
            </button>
            {isOpen && g.items.map((m) => (
              <div key={m.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
                <div className="row">
                  <strong>{m.home_team} vs {m.away_team}</strong>
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
    </div>
  );
}
