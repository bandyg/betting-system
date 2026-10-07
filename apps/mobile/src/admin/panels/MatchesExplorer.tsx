// 赛事大厅（admin 公开页）：筛选/搜索/预设/分组折叠/虚拟滚动/实时赔率/详情弹窗
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, useAuth, useLiveOdds, MATCH_STATUS_LABELS, SEL_LABELS, type Match, type Market, type OddsItem, type OddsUpdateItem } from '@betting/core';
import { Card, OddsChip, LeagueChip, Badge, EmptyState, SkeletonList, Button, Input, Select, toast, useTheme, fontSize, radius, spacing } from '@betting/ui';
import { MatchDetail } from '../MatchDetail';
import { useKeyboardRegistry } from '../keyboard';
import { fmtKickoff, fmtTime, sportLabel } from '../lib';

const PRESETS_KEY = 'mexplorer.presets';
const STATUS_FILTERS: Array<[string, string]> = [
  ['', '全部'], ['scheduled', '未开始'], ['in_progress', '进行中'], ['finished', '已结束'], ['settled', '已结算'],
];
const WHEN_FILTERS: Array<['all' | 'today' | '3d' | '7d', string]> = [
  ['all', '全部'], ['today', '今天'], ['3d', '近3天'], ['7d', '近7天'],
];
const VIRTUAL_THRESHOLD = 40;
const ROW_H = 96;

export interface BasketPick {
  key: string;
  marketId: number;
  matchLabel: string;
  marketLabel: string;
  selection: string;
  price: number;
}

export function MatchesExplorer({ onPick, pickedKeys }: { onPick: (p: BasketPick) => void; pickedKeys: Set<string> }) {
  const t = useTheme();
  const { user } = useAuth();
  const loggedIn = !!user;
  const dims = useWindowDimensions();
  const keyboard = useKeyboardRegistry();

  const [matches, setMatches] = useState<Match[]>([]);
  const [q, setQ] = useState('');
  const [sport, setSport] = useState('');
  const [sports, setSports] = useState<string[]>([]);
  const [league, setLeague] = useState('');
  const [leagueQ, setLeagueQ] = useState('');
  const [status, setStatus] = useState('');
  const [when, setWhen] = useState<'all' | 'today' | '3d' | '7d'>('all');
  const [onlyWithOdds, setOnlyWithOdds] = useState(false);
  const [presets, setPresets] = useState<{ name: string; filter: string }[]>([]);
  const [presetName, setPresetName] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loadedAt, setLoadedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const [liveFlashes, setLiveFlashes] = useState<Record<string, 'up' | 'down' | null>>({});

  // 实时赔率（经 core useLiveOdds：web 同源反代 / native 直连）
  useLiveOdds((updates: OddsUpdateItem[]) => {
    if (updates.length === 0) return;
    setMatches((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((m) => {
        const upd = updates.find((u) => u.marketId && m.markets.some((mk) => mk.id === u.marketId));
        if (!upd) return m;
        return {
          ...m,
          markets: m.markets.map((mk) => {
            if (mk.id !== upd.marketId) return mk;
            return {
              ...mk,
              odds: mk.odds.map((o) => {
                const upd2 = upd.odds.find((x) => x.selection === o.selection);
                if (upd2 && upd2.price !== o.price) {
                  const chipKey = `${m.id}-${mk.id}-${o.selection}`;
                  setLiveFlashes((f) => ({ ...f, [chipKey]: upd2.price > o.price ? 'up' : 'down' }));
                  setTimeout(() => {
                    setLiveFlashes((f) => {
                      const next = { ...f };
                      delete next[chipKey];
                      return next;
                    });
                  }, 1200);
                  return { ...o, price: upd2.price };
                }
                return o;
              }),
            };
          }),
        };
      });
    });
  });

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    AsyncStorage.getItem(PRESETS_KEY)
      .then((raw) => {
        if (raw) setPresets(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  const normSport = useCallback((m: Match) => m.sport?.trim().toLowerCase() || 'other', []);
  const normLeague = useCallback((m: Match) => m.league?.trim() || '', []);
  const allSports = useMemo(() => Array.from(new Set(matches.map(normSport))).sort(), [matches, normSport]);
  const sportCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of matches) map.set(normSport(m), (map.get(normSport(m)) ?? 0) + 1);
    return map;
  }, [matches, normSport]);
  const leagues = useMemo(() => Array.from(new Set(matches.map(normLeague).filter(Boolean))).sort(), [matches, normLeague]);

  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const days = when === 'today' ? 1 : when === '3d' ? 3 : when === '7d' ? 7 : 0;
    const filtered = matches.filter((m) => {
      if (sport && normSport(m) !== sport) return false;
      if (sports.length > 0 && !sports.includes(normSport(m))) return false;
      if (league && normLeague(m) !== league) return false;
      if (status && m.status !== status) return false;
      if (kw && !`${m.home_team} ${m.away_team}`.toLowerCase().includes(kw)) return false;
      if (days > 0) {
        const tk = new Date(m.kickoff_time).getTime();
        if (!Number.isNaN(tk) && (tk < startMs || tk >= startMs + days * 86400000)) return false;
      }
      if (onlyWithOdds && !m.markets.some((mk) => mk.status === 'open' && mk.odds.length > 0)) return false;
      return true;
    });
    const map = new Map<string, { key: string; sport: string; league: string; items: Match[] }>();
    for (const m of filtered) {
      const s = normSport(m);
      const l = normLeague(m) || '未分类联赛';
      const key = `${s}||${l}`;
      const g = map.get(key) ?? { key, sport: s, league: l, items: [] };
      g.items.push(m);
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => a.sport.localeCompare(b.sport) || a.league.localeCompare(b.league));
  }, [matches, q, sport, sports, league, status, when, onlyWithOdds, normSport, normLeague]);

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
    AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(next)).catch(() => {});
    setPresetName('');
    toast.ok(`已保存筛选预设: ${name}`);
  }, [presetName, presets, snapshot]);

  const loadPreset = useCallback((f: string) => {
    try {
      const p = JSON.parse(f) as { q?: string; sport?: string; sports?: string[]; league?: string; status?: string; when?: 'all' | 'today' | '3d' | '7d'; onlyWithOdds?: boolean };
      setQ(p.q ?? '');
      setSport(p.sport ?? '');
      setSports(p.sports ?? []);
      setLeague(p.league ?? '');
      setStatus(p.status ?? '');
      setWhen(p.when ?? 'all');
      setOnlyWithOdds(!!p.onlyWithOdds);
      toast.info('已加载预设');
    } catch {
      toast.err('预设解析失败');
    }
  }, []);

  const delPreset = useCallback((name: string) => {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(next)).catch(() => {});
  }, [presets]);

  const clearAll = useCallback(() => {
    setQ('');
    setSport('');
    setSports([]);
    setLeague('');
    setStatus('');
    setWhen('all');
    setOnlyWithOdds(false);
    setLeagueQ('');
  }, []);

  const totalCount = groups.reduce((n, g) => n + g.items.length, 0);
  const flatMatches = useMemo(() => {
    const out: Match[] = [];
    for (const g of groups) if (!collapsed[g.key]) for (const m of g.items) out.push(m);
    return out;
  }, [groups, collapsed]);
  const useVirtual = flatMatches.length > VIRTUAL_THRESHOLD;
  const liveCount = matches.filter((m) => m.status === 'in_progress' || m.status === 'open').length;

  // 快捷键：前 3 个可见赔率注册进注册表
  const visibleOdds = useMemo(() => {
    const out: { m: Match; mk: Market; o: OddsItem }[] = [];
    for (const m of (useVirtual ? flatMatches : groups.flatMap((g) => (collapsed[g.key] ? [] : g.items)))) {
      for (const mk of m.markets) {
        if (mk.status !== 'open') continue;
        for (const o of mk.odds) out.push({ m, mk, o });
        if (out.length >= 3) return out;
      }
    }
    return out;
  }, [useVirtual, flatMatches, groups, collapsed]);
  useEffect(() => {
    const unsubs = visibleOdds.map((v, i) =>
      keyboard.registerOdds(i + 1, () => {
        if (!loggedIn) return toast.warn('⚠️ 请先登录再下注');
        if (v.mk.status !== 'open') return toast.warn('该市场已关闭，无法下注');
        onPick({ key: `${v.mk.id}:${v.o.selection}`, marketId: v.mk.id, matchLabel: `${v.m.home_team} vs ${v.m.away_team}`, marketLabel: v.mk.type, selection: v.o.selection, price: v.o.price });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [visibleOdds, keyboard, loggedIn, onPick]);

  const handlePickChip = (m: Match, mk: Market, o: OddsItem) => {
    if (!loggedIn) return toast.warn('⚠️ 请先登录再下注');
    if (mk.status !== 'open') return toast.warn('该市场已关闭，无法下注');
    onPick({ key: `${mk.id}:${o.selection}`, marketId: mk.id, matchLabel: `${m.home_team} vs ${m.away_team}`, marketLabel: mk.type, selection: o.selection, price: o.price });
  };

  const chipRow = (m: Match) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {m.markets.map((mk) =>
        mk.odds.map((o) => {
          const chipKey = `${mk.id}:${o.selection}`;
          const liveKey = `${m.id}-${mk.id}-${o.selection}`;
          const open = mk.status === 'open';
          return (
            <OddsChip
              key={`${mk.id}-${o.selection}`}
              testID={`odds-${chipKey}`}
              label={SEL_LABELS[o.selection] ?? o.selection}
              price={o.price}
              selected={pickedKeys.has(chipKey)}
              flash={liveFlashes[liveKey] ?? null}
              disabled={!open}
              onPress={() => handlePickChip(m, mk, o)}
            />
          );
        }),
      )}
    </View>
  );

  const matchRow = (m: Match) => (
    <View key={m.id} testID={`match-row-${m.id}`} style={{ borderTopWidth: 1, borderTopColor: t.border, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pressable testID={`match-title-${m.id}`} onPress={() => setDetailMatch(m)}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: fontSize.md }}>
            {m.home_team} vs {m.away_team}
          </Text>
        </Pressable>
        <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>#{m.id}</Text>
        <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>{fmtKickoff(m.kickoff_time)}</Text>
        <Badge status={m.status} label={MATCH_STATUS_LABELS[m.status] ?? m.status} />
        {m.home_score != null ? (
          <Text style={{ color: t.success, fontWeight: '800' }}>
            {m.home_score} : {m.away_score}
          </Text>
        ) : null}
      </View>
      {m.markets.length > 0 ? chipRow(m) : null}
    </View>
  );

  // 轻量筛选 chip（OddsChip 面向赔率，不适合纯筛选）
  const FilterChip = ({ label, active, onPress, testID }: { label: string; active?: boolean; onPress: () => void; testID?: string }) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: radius.pill,
        backgroundColor: active ? t.oddsActiveBg : t.bgElevated,
        borderColor: active ? t.oddsActiveBorder : t.border,
        borderWidth: 1,
      }}
    >
      <Text style={{ color: active ? t.secondary : t.textSecondary, fontSize: fontSize.sm, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View testID="explorer" style={{ gap: spacing.md, flex: 1 }}>
      {/* sport pills */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <FilterChip label={`全部 (${matches.length})`} active={sports.length === 0 && !sport} onPress={() => { setSports([]); setSport(''); setLeague(''); }} testID="sport-all" />
        {sports.map((s) => (
          <FilterChip key={s} label={`${sportLabel(s)} ✕`} active onPress={() => setSports(sports.filter((x) => x !== s))} testID={`sport-on-${s}`} />
        ))}
        {sports.length === 0 &&
          allSports.map((s) => (
            <FilterChip key={s} label={`${sportLabel(s)} (${sportCounts.get(s) ?? 0})`} active={sport === s} onPress={() => { setSport(s); setLeague(''); }} testID={`sport-${s}`} />
          ))}
      </View>

      {/* stats + onlyWithOdds */}
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
        <Text style={{ color: t.text, fontSize: fontSize.sm }}>
          共 <Text style={{ fontWeight: '900' }}>{totalCount}</Text> 场
        </Text>
        {liveCount > 0 ? (
          <Text style={{ color: t.success, fontSize: fontSize.sm }}>🔴 {liveCount} 进行中</Text>
        ) : null}
        <FilterChip label="✅ 仅开盘" active={onlyWithOdds} onPress={() => setOnlyWithOdds(!onlyWithOdds)} testID="only-open" />
        {loadedAt ? (
          <Text testID="loaded-at" style={{ color: t.textMuted, fontSize: fontSize.xs, marginLeft: 'auto' }}>更新于 {fmtTime(loadedAt)}</Text>
        ) : null}
      </View>

      {/* active filter chips */}
      {(q || sport || sports.length || league || status || when !== 'all' || onlyWithOdds) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontSize: 11 }}>活动筛选:</Text>
          {q ? <FilterChip label={`🔍 "${q}" ✕`} onPress={() => setQ('')} testID="active-q" /> : null}
          {sport ? <FilterChip label={`${sportLabel(sport)} ✕`} onPress={() => setSport('')} /> : null}
          {sports.map((s) => (
            <FilterChip key={s} label={`${sportLabel(s)} ✕`} onPress={() => setSports(sports.filter((x) => x !== s))} />
          ))}
          {league ? <FilterChip label={`📋 ${league} ✕`} onPress={() => setLeague('')} /> : null}
          {status ? <FilterChip label={`${status} ✕`} onPress={() => setStatus('')} /> : null}
          {when !== 'all' ? <FilterChip label={`🕐 ${when === 'today' ? '今天' : when === '3d' ? '近3天' : '近7天'} ✕`} onPress={() => setWhen('all')} /> : null}
          {onlyWithOdds ? <FilterChip label="✅ 仅开盘 ✕" onPress={() => setOnlyWithOdds(false)} /> : null}
          <FilterChip label="全部清除" onPress={clearAll} testID="clear-all" />
        </View>
      ) : null}

      {/* presets */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {presets.map((p) => (
          <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.bgElevated, borderColor: t.borderStrong, borderWidth: 1, borderRadius: radius.pill }}>
            <Pressable testID={`preset-load-${p.name}`} onPress={() => loadPreset(p.filter)} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: t.secondary, fontSize: fontSize.xs, fontWeight: '700' }}>📂 {p.name}</Text>
            </Pressable>
            <Pressable testID={`preset-del-${p.name}`} onPress={() => delPreset(p.name)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>✕</Text>
            </Pressable>
          </View>
        ))}
        <Input testID="preset-name-input" value={presetName} onChangeText={setPresetName} placeholder="💾 保存当前筛选..." style={{ width: 160 }} onSubmitEditing={savePreset} />
        <Button title="保存" variant="ghost" disabled={!presetName.trim()} onPress={savePreset} style={{ paddingHorizontal: spacing.lg, height: 36 }} />
      </View>

      {/* search + league */}
      <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input testID="search-team" value={q} onChangeText={setQ} placeholder="🔍 搜索队名..." style={{ flex: 1, minWidth: 180 }} />
        {leagues.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Input testID="search-league" value={leagueQ} onChangeText={setLeagueQ} placeholder="🔎 联赛" style={{ width: 110 }} />
            <Select
              testID="league-select"
              value={league}
              onChange={setLeague}
              placeholder={`全部联赛 (${filteredLeagues.length})`}
              options={filteredLeagues.map((l) => ({ value: l, label: l }))}
              style={{ width: 150 }}
            />
          </View>
        ) : null}
        <Button title="↻ 刷新" variant="ghost" onPress={() => void refresh()} style={{ paddingHorizontal: spacing.lg, height: 36 }} />
      </View>

      {/* status / when */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>状态</Text>
        {STATUS_FILTERS.map(([v, label]) => (
          <FilterChip key={v || 'all'} label={label} active={status === v} onPress={() => setStatus(v)} testID={`status-${v || 'all'}`} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>时间</Text>
        {WHEN_FILTERS.map(([v, label]) => (
          <FilterChip key={v} label={label} active={when === v} onPress={() => setWhen(v)} testID={`when-${v}`} />
        ))}
      </View>

      {/* body */}
      {loading ? (
        <SkeletonList rows={4} />
      ) : totalCount === 0 ? (
        <EmptyState icon="🔍" title="没有符合条件的赛事" desc="尝试换个状态或时间范围" actionLabel="重置筛选" onAction={clearAll} />
      ) : useVirtual ? (
        <View style={{ flex: 1, minHeight: dims.height * 0.5 }}>
          <Text testID="virtual-badge" style={{ color: t.textMuted, fontSize: fontSize.xs, paddingVertical: 4 }}>
            共 {flatMatches.length} 场（虚拟滚动中）
          </Text>
          <FlatList
            data={flatMatches}
            keyExtractor={(m) => String(m.id)}
            getItemLayout={(_d, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
            renderItem={({ item }) => (
              <View style={{ height: ROW_H, justifyContent: 'center', paddingHorizontal: spacing.md }}>
                <Card style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Pressable onPress={() => setDetailMatch(item)}>
                      <Text style={{ color: t.text, fontWeight: '800' }}>
                        {item.home_team} vs {item.away_team}
                      </Text>
                    </Pressable>
                    <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>#{item.id}</Text>
                    <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>{fmtKickoff(item.kickoff_time)}</Text>
                    <Badge status={item.status} label={MATCH_STATUS_LABELS[item.status] ?? item.status} />
                  </View>
                </Card>
              </View>
            )}
          />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
          {groups.map((g) => {
            const isOpen = !collapsed[g.key];
            return (
              <Card key={g.key} style={{ padding: spacing.md }}>
                <Pressable testID={`group-${g.key}`} onPress={() => setCollapsed((c) => ({ ...c, [g.key]: isOpen }))} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={{ color: t.textSecondary }}>{isOpen ? '▼' : '▶'}</Text>
                  <Text style={{ color: t.text, fontWeight: '700', fontSize: fontSize.sm }}>{sportLabel(g.sport)}</Text>
                  <LeagueChip league={g.league} size="xs" />
                </Pressable>
                {isOpen ? g.items.map(matchRow) : null}
              </Card>
            );
          })}
        </ScrollView>
      )}

      <MatchDetail match={detailMatch} onClose={() => setDetailMatch(null)} onPick={(m, mk, o) => handlePickChip(m, mk, o)} loggedIn={loggedIn} />
    </View>
  );
}
