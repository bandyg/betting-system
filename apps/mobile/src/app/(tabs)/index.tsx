import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useBetSlip,
  TYPE_LABELS,
  SEL_LABELS,
  MATCH_STATUS_LABELS,
  MARKET_STATUS_LABELS,
} from '@betting/core';
import type { Match, OddsItem } from '@betting/core';
import type { MatchWhen } from '../../hooks/use-player-matches';
import {
  Card,
  Screen,
  colors,
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
import { sportIcon } from '../../lib/sport-display';
import { DESKTOP_MIN_VIEWPORT } from '@betting/ui';
import { formatKickoffLocal, kickoffCountdownSuffix } from '../../lib/datetime';

/** LIVE 只认开赛后 3 小时内；几个月前的 scheduled 陈数据不再显示 LIVE */
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

/** 下注单条目需要的比赛展示信息 */
export interface PickMatchInfo {
  matchLabel: string;
  league?: string;
  kickoff?: string;
}

function impliedProbability(price: number): string {
  return `${Math.round((1 / price) * 100)}%`;
}

function OddsRow({
  odds,
  matchId,
  matchInfo,
  suspended,
  onPick,
}: {
  odds: OddsItem[];
  matchId: number;
  matchInfo: PickMatchInfo;
  suspended: boolean;
  onPick: (pick: {
    marketId: number;
    selection: string;
    price: number;
    label: string;
    matchInfo: PickMatchInfo;
  }) => void;
}) {
  const { items } = useBetSlip();
  return (
    <View style={styles.oddsRow}>
      {odds.map((o) => {
        const active = items.some((i) => i.marketId === matchId && i.selection === o.selection);
        const label = SEL_LABELS[o.selection] ?? o.selection;
        return (
          <Pressable
            key={o.selection}
            disabled={suspended}
            accessibilityRole="button"
            aria-label={`${matchInfo.matchLabel} ${label} @${o.price.toFixed(2)}`}
            onPress={() => onPick({ marketId: matchId, selection: o.selection, price: o.price, label, matchInfo })}
            style={({ pressed }) => [
              styles.oddsBtn,
              {
                backgroundColor: suspended
                  ? colors.oddsBg
                  : active
                    ? colors.oddsActiveBg
                    : colors.oddsBg,
                borderColor: suspended
                  ? colors.border
                  : active
                    ? colors.oddsActiveBorder
                    : colors.oddsBorder,
                opacity: suspended ? 0.45 : 1,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
          >
            <Text style={styles.oddsLabel}>{suspended ? '\u5DF2\u6302\u76D8' : label}</Text>
            <Text style={styles.oddsPrice}>{o.price.toFixed(2)}</Text>
            <Text style={styles.oddsProb}>{impliedProbability(o.price)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MarketBlock({
  match,
  onPick,
}: {
  match: Match;
  onPick: (pick: {
    marketId: number;
    selection: string;
    price: number;
    label: string;
    matchInfo: PickMatchInfo;
  }) => void;
}) {
  const matchInfo: PickMatchInfo = {
    matchLabel: `${match.home_team} vs ${match.away_team}`,
    league: match.league ?? undefined,
    kickoff: match.kickoff_time,
  };
  return (
    <View style={styles.marketBlock}>
      {match.markets.map((m) => (
        <View key={m.id} style={styles.marketItem}>
          <Text style={styles.marketTitle}>
            {TYPE_LABELS[m.type] ?? m.type}
            {m.line != null ? ` @${m.line}` : ''}
            {m.status !== 'open' && (
              <Text style={{ color: colors.warning }}>
                {' '}
                {'\u00B7'} {MARKET_STATUS_LABELS[m.status] ?? m.status}
              </Text>
            )}
          </Text>
          <OddsRow odds={m.odds} matchId={m.id} matchInfo={matchInfo} suspended={m.status !== 'open'} onPick={onPick} />
        </View>
      ))}
    </View>
  );
}

function MatchCard({
  match,
  onPick,
}: {
  match: Match;
  onPick: (pick: {
    marketId: number;
    selection: string;
    price: number;
    label: string;
    matchInfo: PickMatchInfo;
  }) => void;
}) {
  const kickoffMs = Date.parse(match.kickoff_time);
  const now = Date.now();
  const isLive =
    !Number.isNaN(kickoffMs) &&
    match.status !== 'finished' &&
    match.status !== 'settled' &&
    kickoffMs <= now &&
    now < kickoffMs + LIVE_WINDOW_MS;
  const isFinished = match.status === 'finished';
  const isSettled = match.status === 'settled' || match.status === 'finished';
  const isFeed = match.source === 'the-odds-api';
  const statusLabel = isLive ? '进行中' : MATCH_STATUS_LABELS[match.status] ?? match.status;
  return (
    <Card testID={`match-row-${match.id}`} style={styles.matchCard}>
      <View style={styles.matchHeader}>
        <View style={styles.sportBadge}>
          <Text style={styles.sportIcon}>{sportIcon(match.sport)}</Text>
          {match.league ? <Text style={styles.leagueLabel}>{match.league}</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamNames}>
            {match.home_team} <Text style={styles.vs}>vs</Text> {match.away_team}
          </Text>
          <Text style={styles.kickoff}>
            {'\uD83D\uDD50'} {formatKickoffLocal(match.kickoff_time)}
            {kickoffCountdownSuffix(match.kickoff_time, now)} {'\u00B7'} {statusLabel}
            {isLive ? <Text style={styles.liveBadge}> {'\u25CF'} LIVE</Text> : null}
            {isFinished ? <Text style={styles.finishedBadge}> 已完场</Text> : null}
            {isFeed ? <Text style={styles.feedBadge}> FEED</Text> : null}
          </Text>
        </View>
        {isSettled && match.home_score != null ? (
          <Text style={styles.score}>
            {match.home_score} : {match.away_score}
          </Text>
        ) : null}
      </View>
      {!isSettled ? <MarketBlock match={match} onPick={onPick} /> : null}
    </Card>
  );
}

interface LeagueGroup {
  key: string;
  sport: string | null;
  league: string;
  matches: Match[];
}

type MatchRowItem =
  | { kind: 'league'; key: string; sport: string | null; league: string; count: number }
  | { kind: 'match'; match: Match }
  /** 桌面双列：同联赛两张卡片并排（b 为空时补占位保持半宽） */
  | { kind: 'pair'; key: string; a: Match; b: Match | null };

function groupByLeague(matches: Match[]): LeagueGroup[] {
  const map = new Map<string, LeagueGroup>();
  for (const match of matches) {
    const sport = match.sport;
    const league = match.league?.trim() || '未分类联赛';
    // 折叠 key 只由运动 + 联赛决定，翻页追加后保持稳定
    const key = `${sport ?? 'other'}||${league}`;
    const group = map.get(key);
    if (group) {
      group.matches.push(match);
    } else {
      map.set(key, { key, sport, league, matches: [match] });
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
      <Text style={styles.leagueHeaderChevron}>{collapsed ? '\u25B8' : '\u25BE'}</Text>
      <Text style={styles.leagueHeaderText} numberOfLines={1}>
        {league}
      </Text>
      <Text style={styles.leagueHeaderCount}>{count} 场</Text>
    </Pressable>
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
  // 可用列表宽 ≈ 窗口 - 侧边栏(216) - dock(316) - 页边距/滚动条(56)；≥700 才值得开双列
  const listWidth = winW - 216 - (dockVisible ? 316 : 0) - 56;
  const twoUp = desktop && listWidth >= 700;
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

  // 扁平化成 ONE FlatList 的行。
  // 单列（手机/平板/窄桌面）：联赛头（通栏）+ 该联赛的赛事行，支持分组折叠。
  // 桌面双列：放弃联赛分头（卡片自带联赛标签），全部比赛按开赛时间排成纯双列网格，
  //   否则联赛普遍只有 1 场时会出现「半宽卡 + 空占位」的稀疏布局。
  const rows = useMemo<MatchRowItem[]>(() => {
    const out: MatchRowItem[] = [];
    if (twoUp) {
      for (let i = 0; i < rowsSource.length; i += 2) {
        out.push({
          kind: 'pair',
          key: `pair:${rowsSource[i].id}`,
          a: rowsSource[i],
          b: rowsSource[i + 1] ?? null,
        });
      }
      return out;
    }
    for (const group of groups) {
      out.push({
        kind: 'league',
        key: group.key,
        sport: group.sport,
        league: group.league,
        count: group.matches.length,
      });
      if (collapsed[group.key]) continue;
      for (const match of group.matches) out.push({ kind: 'match', match });
    }
    return out;
  }, [groups, collapsed, twoUp, rowsSource]);

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
      item.kind === 'league'
        ? `league:${item.key}`
        : item.kind === 'pair'
          ? item.key
          : `match:${item.match.id}`,
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
      if (item.kind === 'pair') {
        return (
          <View style={styles.pairRow}>
            <View style={styles.pairCell}>
              <MatchCard match={item.a} onPick={onPick} />
            </View>
            {item.b ? (
              <View style={styles.pairCell}>
                <MatchCard match={item.b} onPick={onPick} />
              </View>
            ) : (
              <View style={styles.pairCell} />
            )}
          </View>
        );
      }
      return <MatchCard match={item.match} onPick={onPick} />;
    },
    [collapsed, toggleLeague, onPick],
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
    <Screen maxWidth={desktop ? 1500 : undefined}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={dockVisible ? styles.bodyRow : styles.bodyCol}>
          <View style={styles.mainCol}>
            {!desktop ? (
              <View style={styles.header}>
                <Text style={styles.title}>{'\u26A1'} BET PLAY</Text>
                <Text style={styles.subtitle}>
                  {'\u8D5B\u524D\u56FA\u5B9A\u8D54\u7387 \u00B7 \u7ACB\u5373\u4E0B\u6CE8'}
                </Text>
              </View>
            ) : null}

            <MatchFilters
              filters={filters}
              onChange={patchFilters}
              onReset={resetFilters}
              total={total}
              allCollapsed={allCollapsed}
              onToggleCollapseAll={twoUp ? undefined : toggleAll}
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
                      {'\u52A0\u8F7D\u5931\u8D25\uFF1A'}
                      {error}
                    </Text>
                    <Pressable onPress={refresh} style={styles.retryBtn} testID="matches-retry">
                      <Text style={styles.retryText}>{'\u91CD\u8BD5'}</Text>
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
                  {'\uD83C\uDFAB'} 下注单{slipItems.length > 0 ? ` · ${slipItems.length}` : ''}
                </Text>
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dockTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: font.bold },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.hero,
    fontWeight: font.bold,
    color: colors.text,
    letterSpacing: 1,
  },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  list: { flex: 1 },
  skeletonWrap: { padding: spacing.lg },
  listContent: { padding: spacing.lg, paddingBottom: 120 },
  leagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  leagueHeaderChevron: {
    color: colors.secondary,
    fontSize: fontSize.sm,
    width: 16,
    fontWeight: font.bold,
  },
  leagueHeaderText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: font.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  leagueHeaderCount: { color: colors.textMuted, fontSize: fontSize.xs },
  matchCard: { marginBottom: spacing.lg },
  // 桌面双列：两张卡片并排；奇数尾用空占位保持半宽
  pairRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pairCell: { flex: 1, minWidth: 0 },
  liveBadge: { color: '#2ecc71', fontWeight: '700', fontSize: 12 },
  finishedBadge: { color: colors.warning, fontWeight: '600', fontSize: 12 },
  matchHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  sportBadge: { alignItems: 'center', marginRight: spacing.md, minWidth: 40 },
  sportIcon: { fontSize: 22 },
  leagueLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: font.medium,
    marginTop: 2,
    textAlign: 'center',
  },
  teamNames: { fontSize: fontSize.lg, fontWeight: font.bold, color: colors.text },
  vs: { color: colors.textMuted, fontSize: fontSize.md },
  kickoff: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
  feedBadge: { color: colors.secondary, fontSize: fontSize.xs, fontWeight: font.bold },
  score: {
    fontSize: fontSize.xl,
    fontWeight: font.bold,
    color: colors.success,
    marginLeft: spacing.md,
  },
  marketBlock: { marginTop: spacing.md },
  marketItem: { marginBottom: spacing.md },
  marketTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: font.regular,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  oddsRow: { flexDirection: 'row', gap: spacing.sm },
  oddsBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: 10,
    alignItems: 'center',
  },
  oddsLabel: { color: '#8B93B5', fontSize: fontSize.xs, fontWeight: font.regular },
  oddsPrice: { fontSize: fontSize.lg, fontWeight: font.bold, color: colors.text, marginTop: 2 },
  oddsProb: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  errorText: { color: colors.danger, fontSize: fontSize.sm },
  retryBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  retryText: { color: colors.secondary, fontWeight: font.bold, fontSize: fontSize.sm },
});
