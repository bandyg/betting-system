import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from './theme';
import { EmptyState } from './components';
import { SkeletonTable } from './skeleton';
import { fontSize, radius, spacing } from './tokens';

/* ---------------- DataTable ---------------- */

export interface Column<T> {
  key: string;
  label: string;
  /** 列宽权重（flex），默认 1 */
  flex?: number;
  align?: 'left' | 'center' | 'right';
  /** 固定像素宽（与 flex 二选一） */
  width?: number;
  render?: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  loading,
  emptyText = '暂无数据',
  onRowPress,
  testID,
}: {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T, index: number) => string;
  loading?: boolean;
  emptyText?: string;
  onRowPress?: (row: T) => void;
  testID?: string;
}) {
  const t = useTheme();
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  if (loading) return <SkeletonTable cols={Math.min(columns.length, 6)} />;
  if (!rows.length) return <EmptyState text={emptyText} />;

  type AlignStyle = { justifyContent?: 'flex-start' | 'center' | 'flex-end' };
  const alignToFlex = (a?: 'left' | 'center' | 'right'): AlignStyle | undefined =>
    a === 'right' ? { justifyContent: 'flex-end' } : a === 'center' ? { justifyContent: 'center' } : undefined;

  return (
    <View testID={testID} style={{ borderRadius: radius.md, borderColor: t.border, borderWidth: 1, overflow: 'hidden' }}>
      {/* 表头 */}
      <View style={{ flexDirection: 'row', backgroundColor: t.bgElevated, borderBottomWidth: 1, borderBottomColor: t.border, paddingHorizontal: spacing.md }}>
        {columns.map((c) => (
          <View
            key={c.key}
            style={{ flex: c.flex ?? 1, width: c.width, paddingVertical: spacing.sm, ...alignToFlex(c.align) }}
          >
            <Text style={{ color: t.textMuted, fontSize: fontSize.xs, fontWeight: '700' }}>{c.label}</Text>
          </View>
        ))}
      </View>
      {/* 行 */}
      <ScrollView horizontal={false} fadingEdgeLength={40}>
        {rows.map((row, i) => {
          const key = keyExtractor(row, i);
          const hovered = hoverKey === key;
          return (
            <Pressable
              key={key}
              testID={`${testID ?? 'table'}-row-${key}`}
              onHoverIn={() => setHoverKey(key)}
              onHoverOut={() => setHoverKey((k) => (k === key ? null : k))}
              onPress={onRowPress ? () => onRowPress(row) : undefined}
              style={{
                flexDirection: 'row',
                paddingHorizontal: spacing.md,
                backgroundColor: hovered ? t.bgGlass : i % 2 === 1 ? 'rgba(124,58,237,0.04)' : 'transparent',
                borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                borderBottomColor: t.border,
              }}
            >
              {columns.map((c) => (
                <View key={c.key} style={{ flex: c.flex ?? 1, width: c.width, paddingVertical: spacing.sm, ...alignToFlex(c.align) }}>
                  {c.render ? c.render(row) : <Text style={{ color: t.text, fontSize: fontSize.sm }}>{String((row as Record<string, unknown>)[c.key] ?? '')}</Text>}
                </View>
              ))}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ---------------- TabsNav（admin 顶部导航） ---------------- */

export interface TabItem {
  key: string;
  label: string;
  badge?: number | string;
}

export function TabsNav({
  tabs,
  active,
  onChange,
  testID = 'tabs-nav',
}: {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            testID={`tab-${tab.key}`}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: spacing.md + 2,
              paddingVertical: 6,
              borderRadius: radius.pill,
              backgroundColor: isActive ? t.secondary : pressed ? t.border : t.bgElevated,
              borderColor: isActive ? t.secondary : t.border,
              borderWidth: 1,
            })}
          >
            <Text style={{ color: isActive ? '#fff' : t.textSecondary, fontSize: fontSize.sm, fontWeight: '700' }}>{tab.label}</Text>
            {tab.badge !== undefined ? (
              <View style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : t.oddsActiveBg, borderRadius: 8, paddingHorizontal: 6, minWidth: 18, alignItems: 'center' }}>
                <Text style={{ color: isActive ? '#fff' : t.secondary, fontSize: fontSize.xs, fontWeight: '800' }}>{tab.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
