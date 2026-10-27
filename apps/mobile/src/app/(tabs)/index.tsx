import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
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
import {
  DEFAULT_PLAYER_MATCH_FILTERS,
  usePlayerMatches,
} from '../../hooks/use-player-matches';
import type { PlayerMatchFilters } from '../../hooks/use-player-matches';

const SPORT_ICONS: Record<string, string> = {
  soccer: '\u26BD',
  basketball: '\uD83C\uDFC0',
  tennis: '\uD83C\uDFBE',
  baseball: '\u26BE',
  icehockey: '\uD83C\uDFD2',
  football: '\uD83C\uDFC8',
  mma: '\uD83E\uDD4A',
  boxing: '\uD83E\uDD4A',
  other: '\uD83C\uDFC6',
};

/** LIVE 只认开赛后 3 小时内；几个月前的 scheduled 陈数据不再显示 LIVE */
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

function sportIcon(sport: string | null): string {
  return SPORT_ICONS[sport ?? ''] ?? SPORT_ICONS.other;
}

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffM = Math.floor((diffMs % 3600000) / 60000);

  let countdown = '';
  if (diffH > 0 && diffH < 48) countdown = ` \u00B7 ${diffH}h ${diffM}m`;
  else if (diffM > 0 && diffH === 0) countdown = ` \u00B7 ${diffM}m`;

  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}${countdown}`;
}

function impliedProbability(price: number): string {
  return `${Math.round((1 / price) * 100)}%`;
}

function OddsRow({
  odds,
  matchId,
  suspended,
  onPick,
}: {
  odds: OddsItem[];
  matchId: number;
  suspended: boolean;
  onPick: (marketId: number, selection: string, price: number, label: string) => void;
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
            onPress={() => onPick(matchId, o.selection, o.price, label)}
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
  onPick: (marketId: number, selection: string, price: number, label: string) => void;
}) {
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
          <OddsRow odds={m.odds} matchId={m.id} suspended={m.status !== 'open'} onPick={onPick} />
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
  onPick: (marketId: number, selection: string, price: number, label: string) => void;
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
            {'\uD83D\uDD50'} {formatKickoff(match.kickoff_time)} {'\u00B7'} {statusLabel}
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
  | { kind: 'match'; match: Match };

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

  const { add } = useBetSlip();
  const onPick = useCallback(
    (marketId: number, selection: string, price: number, label: string) => {
      add({ marketId, selection, price, label });
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

  // 扁平化成 ONE FlatList 的行：联赛头 + 该联赛的赛事行
  const rows = useMemo<MatchRowItem[]>(() => {
    const out: MatchRowItem[] = [];
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
      desc="试试把日期范围放宽到近3天或全部"
      actionLabel="查看全部日期"
      onAction={() => patchFilters({ when: 'all' })}
    />
  ) : (
    <EmptyState testID="matches-empty" icon="📭" title="暂无赛事" desc="下拉刷新试试" />
  );

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>{'\u26A1'} BET PLAY</Text>
          <Text style={styles.subtitle}>
            {'\u8D5B\u524D\u56FA\u5B9A\u8D54\u7387 \u00B7 \u7ACB\u5373\u4E0B\u6CE8'}
          </Text>
        </View>

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
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
