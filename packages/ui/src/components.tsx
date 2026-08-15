import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, fontSize, font, shadows } from './tokens';
import { useTheme } from './theme';

/* ---------------- Card ---------------- */
export function Card({
  children,
  style,
  glass = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glass?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: glass ? t.bgGlass : t.bgElevated,
          borderColor: t.border,
        },
        shadows.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ---------------- Button ---------------- */
export function Button({
  title,
  onPress,
  variant = 'gradient',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'gradient' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const inner = (
    <View style={[styles.buttonInner, { borderRadius: radius.pill }]}>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.buttonText, variant === 'ghost' && { color: t.primary }]}>
          {title}
        </Text>
      )}
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { borderRadius: radius.pill },
        { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {variant === 'gradient' ? (
        <LinearGradient
          colors={[t.gradientStart, t.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius.pill, backgroundColor: variant === 'danger' ? t.danger : t.bgElevated },
          ]}
        />
      )}
      {inner}
    </Pressable>
  );
}

/* ---------------- OddsButton ---------------- */
export function OddsButton({
  label,
  price,
  active,
  onPress,
}: {
  label: string;
  price: number;
  active?: boolean;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.odds,
        {
          backgroundColor: active ? t.oddsActiveBg : t.oddsBg,
          borderColor: active ? t.oddsActiveBorder : t.oddsBorder,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      <Text style={styles.oddsLabel}>{label}</Text>
      <Text style={[styles.oddsPrice, { color: t.text }]}>{price.toFixed(2)}</Text>
    </Pressable>
  );
}

/* ---------------- SectionTitle ---------------- */
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[styles.sectionTitle, { color: t.text }, style]}>{children}</Text>;
}

/* ---------------- Screen (暗色背景容器) ---------------- */
export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return <View style={[styles.screen, { backgroundColor: t.bg }, style]}>{children}</View>;
}

/* ---------------- EmptyState ---------------- */
export function EmptyState({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={{ color: t.textSecondary, fontSize: fontSize.md }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
  },
  button: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: font.bold,
  },
  odds: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingVertical: 10,
    alignItems: 'center',
  },
  oddsLabel: {
    color: '#8B93B5',
    fontSize: fontSize.xs,
    fontWeight: font.regular,
  },
  oddsPrice: {
    fontSize: fontSize.lg,
    fontWeight: font.bold,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: font.bold,
    marginBottom: 12,
  },
  empty: {
    padding: 32,
    alignItems: 'center',
  },
});

export type { ViewStyle, TextStyle };
