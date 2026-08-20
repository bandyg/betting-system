import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMatches, useSports, useBetSlip, TYPE_LABELS, SEL_LABELS, MATCH_STATUS_LABELS, MARKET_STATUS_LABELS } from '@betting/core';
import type { Match, OddsItem, SportInfo } from '@betting/core';
import { Card, Screen, colors, radius, fontSize, font, spacing, shadows, SectionTitle, EmptyState } from '@betting/ui';

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
                backgroundColor: suspended ? colors.oddsBg : active ? colors.oddsActiveBg : colors.oddsBg,
                borderColor: suspended ? colors.border : active ? colors.oddsActiveBorder : colors.oddsBorder,
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
              <Text style={{ color: colors.warning }}> {'\u00B7'} {MARKET_STATUS_LABELS[m.status] ?? m.status}</Text>
            )}
          </Text>
          <OddsRow odds={m.odds} matchId={m.id} suspended={m.status !== 'open'} onPick={onPick} />
        </View>
      ))}
    </View>
  );
}

function MatchCard({ match, onPick }: { match: Match; onPick: (marketId: number, selection: string, price: number, label: string) => void }) {
  const statusLabel = MATCH_STATUS_LABELS[match.status] ?? match.status;
  const isLive = match.status === 'scheduled' && !Number.isNaN(Date.parse(match.kickoff_time)) && Date.parse(match.kickoff_time) <= Date.now();
  const isFinished = match.status === 'finished';
  const isSettled = match.status === 'settled' || match.status === 'finished';
  const isFeed = match.source === 'the-odds-api';
  return (
    <Card style={styles.matchCard}>
      <View style={styles.matchHeader}>
        <View style={styles.sportBadge}>
          <Text style={styles.sportIcon}>{sportIcon(match.sport)}</Text>
          {match.league && <Text style={styles.leagueLabel}>{match.league}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamNames}>
            {match.home_team} <Text style={styles.vs}>vs</Text> {match.away_team}
          </Text>
          <Text style={styles.kickoff}>
            {'\uD83D\uDD50'} {formatKickoff(match.kickoff_time)} {'\u00B7'} {statusLabel}
            {isLive && <Text style={styles.liveBadge}> {'\u25CF'} LIVE</Text>}
            {isFinished && <Text style={styles.finishedBadge}> 已完场</Text>}
            {isFeed && <Text style={styles.feedBadge}> FEED</Text>}
          </Text>
        </View>
        {isSettled && match.home_score != null && (
          <Text style={styles.score}>
            {match.home_score} : {match.away_score}
          </Text>
        )}
      </View>
      {!isSettled && <MarketBlock match={match} onPick={onPick} />}
    </Card>
  );
}

function SportTabs({
  sports,
  selected,
  onSelect,
}: {
  sports: SportInfo[];
  selected: string | null;
  onSelect: (sport: string | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
      <Pressable
        onPress={() => onSelect(null)}
        style={[styles.tab, selected === null && styles.tabActive]}
      >
        <Text style={[styles.tabText, selected === null && styles.tabTextActive]}>{'\u5168\u90E8'}</Text>
      </Pressable>
      {sports.map((s) => (
        <Pressable
          key={s.sport}
          onPress={() => onSelect(s.sport)}
          style={[styles.tab, selected === s.sport && styles.tabActive]}
        >
          <Text style={[styles.tabText, selected === s.sport && styles.tabTextActive]}>
            {sportIcon(s.sport)} {s.sport.charAt(0).toUpperCase() + s.sport.slice(1)}
          </Text>
          <Text style={[styles.tabCount, selected === s.sport && styles.tabCountActive]}>
            {s.leagues.reduce((sum, l) => sum + l.count, 0)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function LeagueHeader({ league, count }: { league: string; count: number }) {
  return (
    <View style={styles.leagueHeader}>
      <Text style={styles.leagueHeaderText}>{league}</Text>
      <Text style={styles.leagueHeaderCount}>{count} {'\u573A'}</Text>
    </View>
  );
}

export default function MatchesScreen() {
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const { data: sportsData } = useSports();
  const { data, loading, error, refresh } = useMatches(selectedSport ? { sport: selectedSport } : undefined);
  const slip = useBetSlip();

  const onPick = useCallback(
    (marketId: number, selection: string, price: number, label: string) => {
      slip.add({ marketId, selection, price, label });
    },
    [slip]
  );

  // Group matches by league for display
  const groupedMatches = useMemo(() => {
    const matches = data?.matches ?? [];
    const groups = new Map<string, Match[]>();
    for (const m of matches) {
      const key = m.league ?? 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return Array.from(groups.entries());
  }, [data?.matches]);

  const sports = sportsData?.sports ?? [];

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>{'\u26A1'} BET PLAY</Text>
          <Text style={styles.subtitle}>{'\u8D5B\u524D\u56FA\u5B9A\u8D54\u7387 \u00B7 \u7ACB\u5373\u4E0B\u6CE8'}</Text>
        </View>

        {sports.length > 0 && (
          <SportTabs sports={sports} selected={selectedSport} onSelect={setSelectedSport} />
        )}

        {loading && <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 60 }} />}

        {error && (
          <View style={{ padding: 24 }}>
            <Text style={{ color: colors.danger }}>{'\u52A0\u8F7D\u5931\u8D25\uFF1A'}{error}</Text>
            <ButtonText onPress={refresh} label={'\u91CD\u8BD5'} />
          </View>
        )}

        {!loading && !error && (
          <FlatList
            removeClippedSubviews={false}
            data={groupedMatches}
            keyExtractor={([league]) => league}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.secondary} />}
            ListEmptyComponent={<EmptyState text={'\u6682\u65E0\u8D5B\u4E8B\uFF0C\u4E0B\u62C9\u5237\u65B0'} />}
            renderItem={({ item: [league, matches] }) => (
              <View>
                <LeagueHeader league={league} count={matches.length} />
                {matches.map((m) => (
                  <MatchCard key={m.id} match={m} onPick={onPick} />
                ))}
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Screen>
  );
}

function ButtonText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ marginTop: 12 }}>
      <Text style={{ color: colors.secondary, fontWeight: font.bold }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.hero, fontWeight: font.bold, color: colors.text, letterSpacing: 1 },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  tabBar: { maxHeight: 48, paddingHorizontal: spacing.lg },
  tabBarContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  tabText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: font.medium },
  tabTextActive: { color: '#fff' },
  tabCount: { color: colors.textMuted, fontSize: fontSize.xs },
  tabCountActive: { color: 'rgba(255,255,255,0.7)' },
  listContent: { padding: spacing.lg, paddingBottom: 120 },
  leagueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: 4,
  },
  leagueHeaderText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: font.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  leagueHeaderCount: { color: colors.textMuted, fontSize: fontSize.xs },
  matchCard: { marginBottom: spacing.lg },
  liveBadge: {
    color: '#2ecc71',
    fontWeight: '700',
    fontSize: 12,
  },
  finishedBadge: {
    color: colors.warning,
    fontWeight: '600',
    fontSize: 12,
  },
  matchHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  sportBadge: { alignItems: 'center', marginRight: spacing.md, minWidth: 40 },
  sportIcon: { fontSize: 22 },
  leagueLabel: { color: colors.textMuted, fontSize: 9, fontWeight: font.medium, marginTop: 2, textAlign: 'center' },
  teamNames: { fontSize: fontSize.lg, fontWeight: font.bold, color: colors.text },
  vs: { color: colors.textMuted, fontSize: fontSize.md },
  kickoff: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
  feedBadge: { color: colors.secondary, fontSize: fontSize.xs, fontWeight: font.bold },
  score: { fontSize: fontSize.xl, fontWeight: font.bold, color: colors.success, marginLeft: spacing.md },
  marketBlock: { marginTop: spacing.md },
  marketItem: { marginBottom: spacing.md },
  marketTitle: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: font.regular, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
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
});
