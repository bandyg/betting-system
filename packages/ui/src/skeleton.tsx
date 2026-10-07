import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, withRepeat, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { useTheme } from './theme';
import { radius, spacing } from './tokens';

/** 呼吸闪烁容器（shimmer 等价物：透明度脉冲） */
function Pulse({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [opacity]);
  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[aStyle, style]} accessibilityLabel="loading" testID="skeleton">
      {children}
    </Animated.View>
  );
}

function Bar({ w, h = 12 }: { w: number | string; h?: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: w as number,
        height: h,
        borderRadius: radius.sm,
        backgroundColor: t.border,
      }}
    />
  );
}

export function SkeletonLine({ w = '100%', h = 12 }: { w?: number | string; h?: number }) {
  return (
    <Pulse>
      <Bar w={w} h={h} />
    </Pulse>
  );
}

export function SkeletonBlock({ h = 80 }: { h?: number }) {
  const t = useTheme();
  return (
    <Pulse>
      <View style={{ height: h, borderRadius: radius.md, backgroundColor: t.border }} />
    </Pulse>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: rows }, (_, i) => (
        <Pulse key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(124,58,237,0.25)' }} />
            <View style={{ flex: 1, gap: 6 }}>
              <Bar w="55%" />
              <Bar w="30%" h={9} />
            </View>
          </View>
        </Pulse>
      ))}
    </View>
  );
}

/** 表格骨架：表头占位 + N 行错落条 */
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  const t = useTheme();
  const widths: `${number}%`[] = ['18%', '32%', '22%', '16%', '10%', '20%'];
  return (
    <View style={{ gap: spacing.sm }} testID="skeleton-table">
      <View style={{ flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: t.border }}>
        {Array.from({ length: cols }, (_, i) => (
          <Bar key={i} w={widths[i % widths.length] as string} h={10} />
        ))}
      </View>
      {Array.from({ length: rows }, (_, r) => (
        <Pulse key={r}>
          <View style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: 6 }}>
            {Array.from({ length: cols }, (_, c) => (
              <View key={c} style={{ width: widths[c % widths.length] }}>
                <Bar w="85%" h={11} />
              </View>
            ))}
          </View>
        </Pulse>
      ))}
    </View>
  );
}

/** 兼容旧导出名：任意骨架（默认 Line） */
export const SkeletonAny = SkeletonLine;
