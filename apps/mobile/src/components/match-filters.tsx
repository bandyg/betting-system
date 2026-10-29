import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSports } from '@betting/core';
import type { LeagueInfo } from '@betting/core';
import { Input, font, fontSize, spacing, useTheme, SportIcon } from '@betting/ui';
import type { MatchWhen, PlayerMatchFilters } from '../hooks/use-player-matches';
import { DEFAULT_PLAYER_MATCH_FILTERS, buildWindow } from '../hooks/use-player-matches';
import { sportLabel } from '../lib/sport-display';

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
  icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
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
      {icon}
      <Text
        numberOfLines={1}
        style={[styles.chipText, { color: active ? '#fff' : t.textSecondary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 行首小标题：三行 chips（运动/联赛/时间）外观相同，没有标注时「全部/全部联赛/全部」语义易混 */
function RowCaption({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={[styles.rowCaption, { color: t.textMuted }]}>{text}</Text>;
}

export interface MatchFiltersProps {
  filters: PlayerMatchFilters;
  onChange: (patch: Partial<PlayerMatchFilters>) => void;
  onReset: () => void;
  total: number;
  /** 双列网格等无分组头的布局下没有可折叠对象，不传即隐藏「全部收起」 */
  allCollapsed?: boolean;
  onToggleCollapseAll?: () => void;
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
  // 计数口径与列表一致：/sports 按当前日期窗口（scheduled 且在窗口内）统计，
  // 保证 chip 上的数字 = 选中该分类后列表能看到的场次数
  const window = useMemo(() => buildWindow(filters.when), [filters.when]);
  const { data } = useSports(window);
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
      <View>
        <RowCaption text="运动分类" />
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
            const active = filters.sport === s.sport;
            return (
              <FilterChip
                key={s.sport}
                label={`${sportLabel(s.sport)} ${count}`}
                icon={<SportIcon sport={s.sport} size={13} color={active ? '#fff' : t.textSecondary} />}
                active={active}
                onPress={() => onChange({ sport: s.sport, league: null })}
                testID={`sport-${s.sport}`}
              />
            );
          })}
        </ScrollView>
      </View>

      {/* 选中运动后的联赛 chips */}
      {selectedSport && leagueChips.length > 0 ? (
        <View>
          <RowCaption text="联赛" />
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
        </View>
      ) : null}

      {/* 日期窗口 + 仅开盘 */}
      <View>
        <RowCaption text="时间与盘口" />
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
      </View>

      {/* 结果数 / 重置 / 全部收起（空列表没有可收起的东西） */}
      <View style={styles.metaRow}>
        <Text testID="result-count" style={[styles.metaText, { color: t.text }]}>
          共 <Text style={styles.metaStrong}>{total}</Text> 场
        </Text>
        {!isDefault ? (
          <FilterChip label="重置" onPress={onReset} testID="filters-reset" />
        ) : null}
        {total > 0 && onToggleCollapseAll ? (
          <Pressable
            testID="collapse-all"
            accessibilityRole="button"
            onPress={onToggleCollapseAll}
            style={({ pressed }) => [styles.collapseBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.collapseText, { color: t.secondary }]}>
              {allCollapsed ? '全部展开' : '全部收起'}
            </Text>
          </Pressable>
        ) : null}
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
    borderRadius: 4,
    borderWidth: 1,
  },
  chipText: { fontSize: fontSize.sm, fontWeight: font.medium },
  rowCaption: {
    fontSize: fontSize.xs,
    fontWeight: font.bold,
    marginBottom: 2,
    opacity: 0.8,
  },
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
