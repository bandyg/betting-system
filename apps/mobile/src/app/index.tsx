import { useCallback, useState } from 'react';
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
import { useMatches, useBetSlip, TYPE_LABELS, SEL_LABELS, MATCH_STATUS_LABELS } from '@betting/core';
import type { Match, OddsItem } from '@betting/core';
import { Card, Screen, colors, radius, fontSize, font, spacing, shadows, SectionTitle, EmptyState } from '@betting/ui';

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function OddsRow({
  odds,
  matchId,
  onPick,
}: {
  odds: OddsItem[];
  matchId: number;
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
            onPress={() => onPick(matchId, o.selection, o.price, label)}
            style={({ pressed }) => [
              styles.oddsBtn,
              {
                backgroundColor: active ? colors.oddsActiveBg : colors.oddsBg,
                borderColor: active ? colors.oddsActiveBorder : colors.oddsBorder,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
          >
            <Text style={styles.oddsLabel}>{label}</Text>
            <Text style={styles.oddsPrice}>{o.price.toFixed(2)}</Text>
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
          </Text>
          <OddsRow odds={m.odds} matchId={m.id} onPick={onPick} />
        </View>
      ))}
    </View>
  );
}

function MatchCard({ match, onPick }: { match: Match; onPick: (marketId: number, selection: string, price: number, label: string) => void }) {
  const statusLabel = MATCH_STATUS_LABELS[match.status] ?? match.status;
  const isSettled = match.status === 'settled' || match.status === 'finished';
  return (
    <Card style={styles.matchCard}>
      <View style={styles.matchHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.teamNames}>
            {match.home_team} <Text style={styles.vs}>vs</Text> {match.away_team}
          </Text>
          <Text style={styles.kickoff}>
            🕐 {formatKickoff(match.kickoff_time)} · {statusLabel}
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

export default function MatchesScreen() {
  const { data, loading, error, refresh } = useMatches();
  const slip = useBetSlip();

  const onPick = useCallback(
    (marketId: number, selection: string, price: number, label: string) => {
      slip.add({ marketId, selection, price, label });
    },
    [slip]
  );

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>⚡ BET PLAY</Text>
          <Text style={styles.subtitle}>赛前固定赔率 · 立即下注</Text>
        </View>

        {loading && <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 60 }} />}

        {error && (
          <View style={{ padding: 24 }}>
            <Text style={{ color: colors.danger }}>加载失败：{error}</Text>
            <ButtonText onPress={refresh} label="重试" />
          </View>
        )}

        {!loading && !error && (
          <FlatList
            data={data?.matches ?? []}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.secondary} />}
            ListEmptyComponent={<EmptyState text="暂无赛事，下拉刷新" />}
            renderItem={({ item }) => <MatchCard match={item} onPick={onPick} />}
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
  listContent: { padding: spacing.lg, paddingBottom: 120 },
  matchCard: { marginBottom: spacing.lg },
  matchHeader: { flexDirection: 'row', alignItems: 'center' },
  teamNames: { fontSize: fontSize.lg, fontWeight: font.bold, color: colors.text },
  vs: { color: colors.textMuted, fontSize: fontSize.md },
  kickoff: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
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
});
