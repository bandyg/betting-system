import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useBetSlip,
  useLiveOdds,
  usePromotions,
  TYPE_LABELS,
  SEL_LABELS,
  MATCH_STATUS_LABELS,
} from '@betting/core';
import type { Match, Market } from '@betting/core';
import type { MatchWhen } from '../../hooks/use-player-matches';
import {
  Screen,
  sbColors as colors,
  Icon,
  OddsChip,
  radius,
  fontSize,
  font,
  spacing,
  EmptyState,
  SkeletonList,
} from '@betting/ui';
import { MatchFilters, leagueSlug } from '../../components/match-filters';
import { SlipPanel } from '../../components/slip-panel';
import {
  DEFAULT_PLAYER_MATCH_FILTERS,
  usePlayerMatches,
} from '../../hooks/use-player-matches';
import type { PlayerMatchFilters } from '../../hooks/use-player-matches';
import { DESKTOP_MIN_VIEWPORT } from '@betting/ui';
import { formatKickoffLocal } from '../../lib/datetime';
import { usePins } from '../../lib/pins';

/** LIVE 只认开赛后 3 小时内；几个月前的 scheduled 陈数据不再显示 LIVE */
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

/** 下注单条目需要的比赛展示信息 */
export interface PickMatchInfo {
  matchLabel: string;
  league?: string;
  kickoff?: string;
}

/** 玩法选项短标签（行式布局放不下全称） */
const SHORT_LABELS: Record<string, string> = {
  home: '主',
  draw: '和',
  away: '客',
  over: '大',
  under: '小',
};
const shortLabel = (sel: string) => SHORT_LABELS[sel] ?? sel.slice(0, 2);

type OnPick = (pick: {
  marketId: number;
  selection: string;
  price: number;
  label: string;
  matchInfo: PickMatchInfo;
}) => void;

/** 单个玩法市场的一排赔率筹码 */
function MarketOdds({
  market,
  matchInfo,
  flashFor,
  onPick,
}: {
  market: Market;
  matchInfo: PickMatchInfo;
  flashFor: (marketId: number, selection: string) => 'up' | 'down' | undefined;
  onPick: OnPick;
}) {
  const { items } = useBetSlip();
  const suspended = market.status !== 'open';
  if (suspended) {
    return (
      <View style={styles.lockPill}>
        <Icon name="lock" size={12} color={colors.warning} />
        <Text style={styles.lockText}>暂停交易</Text>
      </View>
    );
  }
  return (
    <View style={styles.oddsRow}>
      {market.odds.map((o) => {
        const active = items.some((i) => i.marketId === market.id && i.selection === o.selection);
        return (
          <OddsChip
            key={o.selection}
            label={shortLabel(o.selection)}
            price={o.price}
            selected={active}
            flash={flashFor(market.id, o.selection)}
            onPress={() =>
              onPick({
                marketId: market.id,
                selection: o.selection,
                price: o.price,
                label: SEL_LABELS[o.selection] ?? o.selection,
                matchInfo,
              })
            }
            aria-label={`${matchInfo.matchLabel} ${SEL_LABELS[o.selection] ?? o.selection} @${o.price.toFixed(2)}`}
            testID={`odds-${market.id}-${o.selection}`}
          />
        );
      })}
    </View>
  );
}

/**
 * v3 行式赛事呈现：
 * - 桌面：时间 │ 对阵 │ 钉选 │ 1X2 筹码 │ +N 展开其余玩法（44px 行高）
 * - 移动：紧凑卡（对阵左、赔率竖列右），+N 展开横排
 */
function EventRow({
  match,
  onPick,
  desktop,
  flashFor,
}: {
  match: Match;
  onPick: OnPick;
  desktop: boolean;
  flashFor: (marketId: number, selection: string) => 'up' | 'down' | undefined;
}) {
  const pins = usePins();
  const [expanded, setExpanded] = useState(false);
  const kickoffMs = Date.parse(match.kickoff_time);
  const now = Date.now();
  const isLive =
    !Number.isNaN(kickoffMs) &&
    match.status !== 'finished' &&
    match.status !== 'settled' &&
    kickoffMs <= now &&
    now < kickoffMs + LIVE_WINDOW_MS;
  const isSettled = match.status === 'settled' || match.status === 'finished';
  const statusLabel = isLive ? '进行中' : MATCH_STATUS_LABELS[match.status] ?? match.status;

  const matchInfo: PickMatchInfo = {
    matchLabel: `${match.home_team} vs ${match.away_team}`,
    league: match.league ?? undefined,
    kickoff: match.kickoff_time,
  };
  const primary = match.markets.find((m) => m.type === '1x2') ?? match.markets[0];
  const extras = match.markets.filter((m) => m.id !== primary?.id);
  const pinned = pins.has(match.id);
  const metaText = `${formatKickoffLocal(match.kickoff_time)}${
    !isLive ? ` · ${kickoffCountdownSuffixSafe(match.kickoff_time, now)}` : ''
  } · ${statusLabel}`;

  if (desktop) {
    return (
      <View style={[styles.evRow, isLive && styles.evLive]} testID={`match-row-${match.id}`}>
        <View style={styles.evTime}>
          <Text style={styles.evDay}>{isLive ? '进行中' : formatKickoffLocal(match.kickoff_time).split(' ')[0]}</Text>
          <Text style={styles.evTimeText}>
            {isLive ? (
              <Text style={styles.liveText}>● LIVE</Text>
            ) : (
              formatKickoffLocal(match.kickoff_time).split(' ')[1] ?? ''
            )}
          </Text>
        </View>
        <View style={styles.evTeams}>
          <Text style={styles.evName} numberOfLines={1}>
            {match.home_team} <Text style={styles.evVs}>vs</Text> {match.away_team}
          </Text>
          {isLive && match.home_score != null ? (
            <Text style={styles.evScore}>
              {match.home_score} : {match.away_score}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pinned ? '取消钉选' : '钉选赛事'}
          onPress={() => pins.toggle(match.id)}
          hitSlop={6}
          style={styles.evPin}
        >
          <Icon name="star" size={14} color={pinned ? colors.accent : colors.textMuted} />
        </Pressable>
        {isSettled ? (
          <Text style={styles.evScore}>{match.home_score ?? 0} : {match.away_score ?? 0}</Text>
        ) : primary ? (
          <MarketOdds market={primary} matchInfo={matchInfo} flashFor={flashFor} onPick={onPick} />
        ) : null}
        {extras.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            testID={`more-markets-${match.id}`}
            onPress={() => setExpanded((v) => !v)}
            style={styles.moreBtn}
          >
            <Text style={styles.moreText}>{expanded ? '−' : `+${extras.length}`}</Text>
          </Pressable>
        ) : null}
        {expanded && extras.length > 0 ? (
          <View style={styles.expandBlock}>
            {extras.map((m) => (
              <View key={m.id} style={styles.expandItem}>
                <Text style={styles.marketTitle}>
                  {TYPE_LABELS[m.type] ?? m.type}
                  {m.line != null ? ` @${m.line}` : ''}
                </Text>
                <MarketOdds market={m} matchInfo={matchInfo} flashFor={flashFor} onPick={onPick} />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  // 移动紧凑卡
  return (
    <View style={[styles.mCard, isLive && styles.evLive]} testID={`match-row-${match.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pinned ? '取消钉选' : '钉选赛事'}
        onPress={() => pins.toggle(match.id)}
        hitSlop={6}
        style={styles.mPin}
      >
        <Icon name="star" size={13} color={pinned ? colors.accent : colors.textMuted} />
      </Pressable>
      <View style={styles.mTeams}>
        <Text style={styles.mTeam} numberOfLines={1}>{match.home_team}</Text>
        <Text style={styles.mTeam} numberOfLines={1}>{match.away_team}</Text>
        <Text style={styles.mMeta} numberOfLines={1}>
          {isLive ? <Text style={styles.liveText}>● LIVE </Text> : null}
          {metaText}
        </Text>
      </View>
      {isSettled ? (
        <Text style={styles.evScore}>{match.home_score ?? 0} : {match.away_score ?? 0}</Text>
      ) : primary ? (
        <View style={styles.mOddsCol}>
          <MarketOdds market={primary} matchInfo={matchInfo} flashFor={flashFor} onPick={onPick} />
        </View>
      ) : null}
      {expanded && extras.length > 0 ? (
        <View style={styles.expandBlock}>
          {extras.map((m) => (
            <View key={m.id} style={styles.expandItem}>
              <Text style={styles.marketTitle}>
                {TYPE_LABELS[m.type] ?? m.type}
                {m.line != null ? ` @${m.line}` : ''}
              </Text>
              <MarketOdds market={m} matchInfo={matchInfo} flashFor={flashFor} onPick={onPick} />
            </View>
          ))}
        </View>
      ) : null}
      {extras.length > 0 && !expanded ? (
        <Pressable
          accessibilityRole="button"
          testID={`more-markets-${match.id}`}
          onPress={() => setExpanded(true)}
          style={styles.mMore}
        >
          <Text style={styles.moreText}>+{extras.length}</Text>
        </Pressable>
      ) : null}
      {expanded && extras.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded(false)}
          style={styles.mMore}
        >
          <Text style={styles.moreText}>−</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function kickoffCountdownSuffixSafe(iso: string, now: number): string {
  const diff = Date.parse(iso) - now;
  if (Number.isNaN(diff) || diff <= 0) return '';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0 && h < 48) return `${h}h ${m}m`;
  if (h === 0 && m > 0) return `${m}m`;
  return '';
}

interface LeagueGroup {
  key: string;
  sport: string | null;
  league: string;
  matches: Match[];
}

type MatchRowItem =
  | { kind: 'league'; key: string; league: string; count: number }
  | { kind: 'match'; match: Match };

function groupByLeague(matches: Match[]): LeagueGroup[] {
  const map = new Map<string, LeagueGroup>();
  for (const match of matches) {
    const league = match.league?.trim() || '未分类联赛';
    // 折叠 key 只由运动 + 联赛决定，翻页追加后保持稳定
    const key = `${match.sport ?? 'other'}||${league}`;
    const group = map.get(key);
    if (group) {
      group.matches.push(match);
    } else {
      map.set(key, { key, sport: match.sport, league, matches: [match] });
    }
  }
  return Array.from(map.values());
}

function LeagueHeaderRow({
  league,
  count,
  collapsed,
  onToggle,
}: {
  league: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      testID={`league-header-${leagueSlug(league)}`}
      onPress={onToggle}
      style={({ pressed }) => [styles.leagueHeader, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.leagueHeaderChevron}>{collapsed ? '▸' : '▾'}</Text>
      <Text style={styles.leagueHeaderText} numberOfLines={1}>
        {league}
      </Text>
      <Text style={styles.leagueHeaderCount}>{count} 场</Text>
    </Pressable>
  );
}

/** hero 精选/促销区（绑定现有促销 API；无进行中活动时整区隐藏） */
function HeroStrip() {
  const promos = usePromotions('active');
  const router = useRouter();
  const items = promos.data?.promotions ?? [];
  if (promos.loading || items.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.hero}
      contentContainerStyle={styles.heroContent}
      testID="lobby-hero"
    >
      {items.slice(0, 5).map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => router.push('/promo')}
          style={({ pressed }) => [styles.heroCard, { opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={styles.heroTagWrap}>
            <Icon name="fire" size={11} color={colors.accent} />
            <Text style={styles.heroTag}>促销进行中</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={1}>{p.title}</Text>
          <Text style={styles.heroDesc} numberOfLines={1}>{p.description}</Text>
          <View style={styles.heroCta}>
            <Text style={styles.heroCtaText}>查看</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function MatchesScreen() {
  const [filters, setFilters] = useState<PlayerMatchFilters>(DEFAULT_PLAYER_MATCH_FILTERS);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const {
    rowsSource,
    total,
    loading,
    loadingMore,
    refreshing,
    error,
    hasMore,
    refresh,
    loadMore,
  } = usePlayerMatches(filters);

  const { add, items: slipItems } = useBetSlip();
  // 桌面 webapp：右侧下注单 dock（选中赔率后即时结算，无需跳 /slip）
  const { width: winW } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && winW >= DESKTOP_MIN_VIEWPORT;
  const [dockMsg, setDockMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const dockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onDockMsg = useCallback((m: { kind: 'ok' | 'err'; text: string } | null) => {
    setDockMsg(m);
    if (m) {
      clearTimeout(dockTimer.current);
      dockTimer.current = setTimeout(() => setDockMsg(null), 4000);
    }
  }, []);
  const dockVisible = desktop && (slipItems.length > 0 || dockMsg !== null);

  // WS 赔率涨跌：与上一笔价格对比，1.5s 后清除闪烁
  const priceRef = useRef<Record<number, Record<string, number>>>({});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [flash, setFlash] = useState<Record<string, 'up' | 'down'>>({});
  const flashFor = useCallback(
    (marketId: number, selection: string) => flash[`${marketId}:${selection}`],
    [flash],
  );
  useLiveOdds((updates) => {
    const next: Record<string, 'up' | 'down'> = {};
    for (const u of updates) {
      const before = priceRef.current[u.marketId];
      for (const o of u.odds) {
        if (before && before[o.selection] != null && before[o.selection] !== o.price) {
          next[`${u.marketId}:${o.selection}`] = o.price > before[o.selection] ? 'up' : 'down';
        }
      }
      priceRef.current[u.marketId] = Object.fromEntries(u.odds.map((o) => [o.selection, o.price]));
    }
    if (Object.keys(next).length > 0) {
      setFlash(next);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash({}), 1500);
    }
  });
  // 列表数据落地时记录基准价（首个对比基准）
  useEffect(() => {
    for (const match of rowsSource) {
      for (const m of match.markets) {
        if (!priceRef.current[m.id]) {
          priceRef.current[m.id] = Object.fromEntries(m.odds.map((o) => [o.selection, o.price]));
        }
      }
    }
  }, [rowsSource]);

  const onPick = useCallback(
    (pick: {
      marketId: number;
      selection: string;
      price: number;
      label: string;
      matchInfo: PickMatchInfo;
    }) => {
      add({
        marketId: pick.marketId,
        selection: pick.selection,
        price: pick.price,
        label: pick.label,
        matchLabel: pick.matchInfo.matchLabel,
        league: pick.matchInfo.league,
        kickoff: pick.matchInfo.kickoff,
      });
    },
    [add],
  );

  const patchFilters = useCallback((patch: Partial<PlayerMatchFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_PLAYER_MATCH_FILTERS);
  }, []);

  const groups = useMemo(() => groupByLeague(rowsSource), [rowsSource]);

  // 扁平化成 ONE FlatList 的行：联赛头（可折叠）+ 该联赛的赛事行
  const rows = useMemo<MatchRowItem[]>(() => {
    const out: MatchRowItem[] = [];
    for (const group of groups) {
      out.push({ kind: 'league', key: group.key, league: group.league, count: group.matches.length });
      if (collapsed[group.key]) continue;
      for (const match of group.matches) out.push({ kind: 'match', match });
    }
    return out;
  }, [groups, collapsed]);

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed[g.key]);

  const toggleLeague = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAll = useCallback(() => {
    setCollapsed((prev) => {
      if (groups.length === 0) return prev;
      const everyCollapsed = groups.every((g) => prev[g.key]);
      const next = { ...prev };
      for (const g of groups) next[g.key] = !everyCollapsed;
      return next;
    });
  }, [groups]);

  const keyExtractor = useCallback(
    (item: MatchRowItem) =>
      item.kind === 'league' ? `league:${item.key}` : `match:${item.match.id}`,
    [],
  );

  const renderRow = useCallback(
    ({ item }: { item: MatchRowItem }) => {
      if (item.kind === 'league') {
        return (
          <LeagueHeaderRow
            league={item.league}
            count={item.count}
            collapsed={!!collapsed[item.key]}
            onToggle={() => toggleLeague(item.key)}
          />
        );
      }
      return <EventRow match={item.match} onPick={onPick} desktop={desktop} flashFor={flashFor} />;
    },
    [collapsed, toggleLeague, onPick, desktop, flashFor],
  );

  const footer = useMemo(() => {
    if (loadingMore) {
      return (
        <View testID="list-footer" style={styles.footer}>
          <ActivityIndicator color={colors.secondary} />
        </View>
      );
    }
    if (!hasMore && rowsSource.length > 0) {
      return (
        <Text testID="list-footer" style={styles.footerText}>
          已全部加载 {'\u00B7'} {total} 场
        </Text>
      );
    }
    return <View testID="list-footer" />;
  }, [loadingMore, hasMore, rowsSource.length, total]);

  const hasNarrowFilters =
    filters.q.trim() !== '' ||
    filters.sport !== null ||
    filters.league !== null ||
    filters.onlyOpen;

  // 空态文案要跟当前日期筛选自洽：不能再建议用户选一个已经选中的范围
  const whenEmptyHint: Record<MatchWhen, { desc: string; actionLabel?: string }> = {
    today: { desc: '今天暂无赛事，试试「近3天」或「全部」', actionLabel: '查看近3天' },
    '3d': { desc: '近3天暂无赛事，试试「全部」查看更远赛程', actionLabel: '查看全部日期' },
    all: { desc: '暂无可浏览的赛事，下拉刷新试试' },
  };

  const emptyState = hasNarrowFilters ? (
    <EmptyState
      testID="matches-empty"
      icon="🔍"
      title="没有符合条件的赛事"
      desc="换个关键词，或清除部分筛选条件"
      actionLabel="清除筛选"
      onAction={resetFilters}
    />
  ) : filters.when !== 'all' ? (
    <EmptyState
      testID="matches-empty"
      icon="📅"
      title="该时段暂无赛事"
      desc={whenEmptyHint[filters.when].desc}
      actionLabel={whenEmptyHint[filters.when].actionLabel}
      onAction={() =>
        patchFilters({ when: filters.when === 'today' ? '3d' : 'all' })
      }
    />
  ) : (
    <EmptyState testID="matches-empty" icon="📭" title="暂无赛事" desc="下拉刷新试试" />
  );

  return (
    <Screen maxWidth={desktop ? 1400 : undefined}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={dockVisible ? styles.bodyRow : styles.bodyCol}>
          <View style={styles.mainCol}>
            <HeroStrip />

            <MatchFilters
              filters={filters}
              onChange={patchFilters}
              onReset={resetFilters}
              total={total}
              allCollapsed={allCollapsed}
              onToggleCollapseAll={toggleAll}
            />

            {loading ? (
              <View style={styles.skeletonWrap}>
                <SkeletonList rows={6} />
              </View>
            ) : (
              <>
                {error ? (
                  <View style={styles.errorBlock}>
                    <Text style={styles.errorText}>
                      {'加载失败：'}
                      {error}
                    </Text>
                    <Pressable onPress={refresh} style={styles.retryBtn} testID="matches-retry">
                      <Text style={styles.retryText}>重试</Text>
                    </Pressable>
                  </View>
                ) : null}

                <FlatList
                  style={styles.list}
                  data={rows}
                  keyExtractor={keyExtractor}
                  renderItem={renderRow}
                  initialNumToRender={12}
                  maxToRenderPerBatch={8}
                  windowSize={7}
                  removeClippedSubviews={false}
                  onEndReached={loadMore}
                  onEndReachedThreshold={0.4}
                  contentContainerStyle={styles.listContent}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={refresh}
                      tintColor={colors.secondary}
                    />
                  }
                  ListEmptyComponent={error ? null : emptyState}
                  ListFooterComponent={footer}
                />
              </>
            )}
          </View>

          {dockVisible ? (
            <View style={styles.dock} testID="slip-dock">
              <View style={styles.dockHeader}>
                <Text style={styles.dockTitle}>
                  下注单{slipItems.length > 0 ? ` · ${slipItems.length}` : ''}
                </Text>
                <Text style={styles.dockClear}>清空</Text>
              </View>
              <SlipPanel slim onMsgChange={onDockMsg} />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bodyCol: { flex: 1 },
  bodyRow: { flex: 1, flexDirection: 'row' },
  mainCol: { flex: 1, minWidth: 0 },
  dock: {
    width: 300,
    marginLeft: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  dockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  dockTitle: { color: colors.text, fontSize: 12.5, fontWeight: font.bold },
  dockClear: { color: colors.textMuted, fontSize: 11 },

  // hero 精选/促销
  hero: { maxHeight: 108 },
  heroContent: { gap: 10, paddingRight: 14, paddingBottom: 6 },
  heroCard: {
    width: 300,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1F5236',
    backgroundColor: colors.bgElevated,
    padding: 12,
    position: 'relative',
  },
  heroTagWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  heroTag: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: colors.accent },
  heroTitle: { color: colors.text, fontSize: 12.5, fontWeight: font.bold },
  heroDesc: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  heroCta: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroCtaText: { color: '#1B1B00', fontWeight: '900', fontSize: 11 },

  // 行式赛事
  list: { flex: 1 },
  listContent: { padding: spacing.lg, paddingBottom: 120 },
  leagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: 5,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  leagueHeaderChevron: {
    color: colors.textMuted,
    fontSize: 11,
    width: 14,
    fontWeight: font.bold,
  },
  leagueHeaderText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: font.bold,
    letterSpacing: 1.1,
  },
  leagueHeaderCount: { color: colors.textMuted, fontSize: 11 },
  evRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderBottomColor: '#1F1F1F',
    borderRadius: radius.sm,
    marginBottom: 3,
    paddingVertical: 5,
    paddingHorizontal: 10,
    minHeight: 48,
    flexWrap: 'wrap',
  },
  evLive: {
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    backgroundColor: colors.bgElevated,
  },
  evTime: { width: 66, flex: 0 },
  evDay: { fontSize: 10, color: colors.textMuted },
  evTimeText: { fontSize: 12, fontWeight: font.bold, color: colors.text, fontVariant: ['tabular-nums'] as const },
  liveText: { color: colors.danger, fontSize: 10, fontWeight: '900' },
  evTeams: { flex: 1, minWidth: 120, paddingRight: 8 },
  evName: { fontSize: 12.5, fontWeight: font.bold, color: colors.text },
  evVs: { color: colors.textMuted, fontWeight: font.medium },
  evScore: {
    color: colors.danger,
    fontWeight: '900',
    fontSize: 13,
    fontVariant: ['tabular-nums'] as const,
    paddingHorizontal: 8,
  },
  evPin: { paddingHorizontal: 6 },
  oddsRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', alignItems: 'center' },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lockText: { color: colors.warning, fontSize: 10.5, fontWeight: font.bold, letterSpacing: 1 },
  moreBtn: {
    width: 30,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  moreText: { color: colors.textMuted, fontSize: 11 },
  expandBlock: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  expandItem: { marginRight: spacing.md },
  marketTitle: {
    color: colors.textSecondary,
    fontSize: 10.5,
    fontWeight: font.regular,
    marginBottom: 4,
    letterSpacing: 0.4,
  },

  // 移动紧凑卡
  mCard: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  mPin: { position: 'absolute', right: 8, top: 8, padding: 3 },
  mTeams: { flex: 1, minWidth: 100, paddingRight: 8 },
  mTeam: { color: colors.text, fontSize: 12.5, fontWeight: font.bold },
  mMeta: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  mOddsCol: { flexDirection: 'column', gap: 4 },
  mMore: {
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 4,
    marginTop: 6,
  },

  skeletonWrap: { padding: spacing.lg },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
  footerText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.xs,
    paddingVertical: spacing.lg,
  },
  errorBlock: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  errorText: { color: colors.danger, fontSize: fontSize.sm },
  retryBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  retryText: { color: colors.secondary, fontWeight: font.bold, fontSize: fontSize.sm },
});
