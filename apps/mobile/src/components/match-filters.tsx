import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSports } from '@betting/core';
import type { LeagueInfo } from '@betting/core';
import { Input, font, fontSize, radius, spacing, useTheme } from '@betting/ui';
import type { MatchWhen, PlayerMatchFilters } from '../hooks/use-player-matches';
import { DEFAULT_PLAYER_MATCH_FILTERS } from '../hooks/use-player-matches';

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

function sportLabel(sport: string): string {
  return sport ? sport.charAt(0).toUpperCase() + sport.slice(1) : sport;
}

/** 稳定的 testID / 折叠 key 片段：保留中文与字母数字，其余折成 - */
export function leagueSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'league';
}

const WHEN_OPTIONS: Array<[MatchWhen, string]> = [
  ['today', '今天'],
  ['3d', '近3天'],
  ['all', '全部'],
];

const MAX_LEAGUE_CHIPS = 30;

function FilterChip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? t.secondary : t.bgElevated,
          borderColor: active ? t.secondary : t.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.chipText, { color: active ? '#fff' : t.textSecondary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface MatchFiltersProps {
  filters: PlayerMatchFilters;
  onChange: (patch: Partial<PlayerMatchFilters>) => void;
  onReset: () => void;
  total: number;
  allCollapsed: boolean;
  onToggleCollapseAll: () => void;
}

export function MatchFilters({
  filters,
  onChange,
  onReset,
  total,
  allCollapsed,
  onToggleCollapseAll,
}: MatchFiltersProps) {
  const t = useTheme();
  const { data } = useSports();
  const sports = useMemo(() => data?.sports ?? [], [data]);

  const selectedSport = useMemo(
    () => (filters.sport ? sports.find((s) => s.sport === filters.sport) : undefined),
    [sports, filters.sport],
  );

  // 联赛 chip：按场次数降序，最多 30 个
  const leagueChips = useMemo<LeagueInfo[]>(() => {
    if (!selectedSport) return [];
    return [...selectedSport.leagues].sort((a, b) => b.count - a.count).slice(0, MAX_LEAGUE_CHIPS);
  }, [selectedSport]);

  const isDefault =
    filters.q.trim() === '' &&
    filters.sport === null &&
    filters.league === null &&
    filters.when === DEFAULT_PLAYER_MATCH_FILTERS.when &&
    !filters.onlyOpen;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: t.bg, borderBottomColor: t.border },
      ]}
    >
      {/* 搜索 */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Input
            testID="matches-search"
            value={filters.q}
            onChangeText={(q) => onChange({ q })}
            placeholder="搜索球队或联赛"
            style={styles.searchInput}
          />
          {filters.q.length > 0 ? (
            <Pressable
              testID="matches-search-clear"
              onPress={() => onChange({ q: '' })}
              hitSlop={8}
              style={styles.clearBtn}
            >
              <Text style={[styles.clearText, { color: t.textMuted }]}>{'\u2715'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* 运动项目 chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRowContent}
        style={styles.chipRow}
      >
        <FilterChip
          label="全部"
          active={filters.sport === null}
          onPress={() => onChange({ sport: null, league: null })}
          testID="sport-all"
        />
        {sports.map((s) => {
          const count = s.leagues.reduce((sum, l) => sum + l.count, 0);
          return (
            <FilterChip
              key={s.sport}
              label={`${sportIcon(s.sport)} ${sportLabel(s.sport)} ${count}`}
              active={filters.sport === s.sport}
              onPress={() => onChange({ sport: s.sport, league: null })}
              testID={`sport-${s.sport}`}
            />
          );
        })}
      </ScrollView>

      {/* 选中运动后的联赛 chips */}
      {selectedSport && leagueChips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRowContent}
          style={styles.chipRow}
        >
          <FilterChip
            label="全部联赛"
            active={filters.league === null}
            onPress={() => onChange({ league: null })}
            testID="league-all"
          />
          {leagueChips.map((l) => (
            <FilterChip
              key={l.league}
              label={`${l.league} ${l.count}`}
              active={filters.league === l.league}
              onPress={() => onChange({ league: filters.league === l.league ? null : l.league })}
              testID={`league-${leagueSlug(l.league)}`}
            />
          ))}
        </ScrollView>
      ) : null}

      {/* 日期窗口 + 仅开盘 */}
      <View style={styles.whenRow}>
        {WHEN_OPTIONS.map(([value, label]) => (
          <FilterChip
            key={value}
            label={label}
            active={filters.when === value}
            onPress={() => onChange({ when: value })}
            testID={`when-${value}`}
          />
        ))}
        <FilterChip
          label="仅开盘"
          active={filters.onlyOpen}
          onPress={() => onChange({ onlyOpen: !filters.onlyOpen })}
          testID="only-open"
        />
      </View>

      {/* 结果数 / 重置 / 全部收起 */}
      <View style={styles.metaRow}>
        <Text testID="result-count" style={[styles.metaText, { color: t.text }]}>
          共 <Text style={styles.metaStrong}>{total}</Text> 场
        </Text>
        {!isDefault ? (
          <FilterChip label="重置" onPress={onReset} testID="filters-reset" />
        ) : null}
        <Pressable
          testID="collapse-all"
          onPress={onToggleCollapseAll}
          style={({ pressed }) => [styles.collapseBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.collapseText, { color: t.secondary }]}>
            {allCollapsed ? '全部展开' : '全部收起'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchWrap: { flex: 1, position: 'relative', justifyContent: 'center' },
  searchInput: { paddingRight: 34 },
  clearBtn: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { fontSize: fontSize.md, fontWeight: font.bold },
  chipRow: { maxHeight: 36 },
  chipRowContent: { gap: spacing.sm, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: fontSize.sm, fontWeight: font.medium },
  whenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaText: { fontSize: fontSize.sm },
  metaStrong: { fontWeight: font.bold },
  collapseBtn: { marginLeft: 'auto', paddingHorizontal: 4, paddingVertical: 4 },
  collapseText: { fontSize: fontSize.sm, fontWeight: font.bold },
});
