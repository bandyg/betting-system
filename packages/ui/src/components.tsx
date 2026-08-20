import React, { useEffect, useRef } from 'react';
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
import Animated, {
  BounceIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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
  const scale = useSharedValue(1);
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
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.buttonWrap, animStyle]}>
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        onPressIn={() => {
          scale.value = withSpring(0.96, { damping: 14, stiffness: 320 });
        }}
        onPressOut={() => {
          scale.value = withSequence(
            withSpring(1.03, { damping: 10, stiffness: 260 }),
            withSpring(1, { damping: 12, stiffness: 240 })
          );
        }}
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
    </Animated.View>
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
  const scale = useSharedValue(1);
  // 0 = 无闪烁, 1 = 升(绿), -1 = 降(红)
  const flash = useSharedValue(0);
  const prevPrice = useRef(price);
  const prevActive = useRef(active);

  // 赔率变化闪烁（升绿/降红）——未来接入赔率推送后自动生效
  useEffect(() => {
    if (prevPrice.current !== price) {
      flash.value = price > prevPrice.current ? 1 : -1;
      flash.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 700 }));
      prevPrice.current = price;
    }
  }, [price, flash]);

  // 加入下注单成功反馈：active false→true 时绿闪一下
  useEffect(() => {
    if (!prevActive.current && active) {
      flash.value = 1;
      flash.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 700 }));
    }
    prevActive.current = active;
  }, [active, flash]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: Math.abs(flash.value),
    backgroundColor: flash.value > 0 ? colors.success : colors.danger,
  }));

  return (
    <Animated.View
      style={[
        styles.odds,
        {
          backgroundColor: active ? t.oddsActiveBg : t.oddsBg,
          borderColor: active ? t.oddsActiveBorder : t.oddsBorder,
        },
        animStyle,
      ]}
    >
      <Animated.View pointerEvents="none" style={[styles.oddsFlash, flashStyle]} />
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.92, { damping: 14, stiffness: 320 });
        }}
        onPressOut={() => {
          scale.value = withSequence(
            withSpring(1.08, { damping: 9, stiffness: 240 }),
            withSpring(1, { damping: 12, stiffness: 220 })
          );
        }}
        style={styles.oddsPress}
      >
        <Text style={styles.oddsLabel}>{label}</Text>
        <Text style={[styles.oddsPrice, { color: t.text }]}>{price.toFixed(2)}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ---------------- PromotionCard (CRM 促销卡片) ---------------- */
export function PromotionCard({
  title,
  description,
  bonusLabel,
  claimStatus,
  onClaim,
}: {
  title: string;
  description: string;
  bonusLabel: string;
  claimStatus?: 'pending' | 'approved' | 'rejected' | null;
  onClaim?: () => void;
}) {
  const t = useTheme();
  return (
    <Card glass style={styles.promoCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.promoTitle}>{title}</Text>
        <Text style={styles.promoDesc}>{description}</Text>
        <View style={styles.promoBonus}>
          <Text style={styles.promoBonusText}>{bonusLabel}</Text>
        </View>
      </View>
      {claimStatus === 'approved' ? (
        <View style={[styles.promoClaimed, { borderColor: t.success }]}>
          <Text style={{ color: t.success, fontSize: fontSize.sm, fontWeight: font.bold }}>已领取 ✓</Text>
        </View>
      ) : claimStatus === 'pending' ? (
        <View style={[styles.promoClaimed, { borderColor: t.warning }]}>
          <Text style={{ color: t.warning, fontSize: fontSize.sm, fontWeight: font.bold }}>审核中…</Text>
        </View>
      ) : claimStatus === 'rejected' ? (
        <View style={[styles.promoClaimed, { borderColor: t.danger }]}>
          <Text style={{ color: t.danger, fontSize: fontSize.sm, fontWeight: font.bold }}>已拒绝</Text>
        </View>
      ) : (
        <Pressable
          onPress={onClaim}
          style={({ pressed }) => [
            styles.promoClaimBtn,
            { backgroundColor: t.gradientStart, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: font.bold }}>领取</Text>
        </Pressable>
      )}
    </Card>
  );
}

/* ---------------- Banner (CMS 公告) ---------------- */
export function Banner({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: 'rgba(124,58,237,0.15)', borderColor: t.borderStrong }]}>
      <Text style={styles.bannerIcon}>📢</Text>
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

/* ---------------- SectionTitle ---------------- */
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[styles.sectionTitle, { color: t.text }, style]}>{children}</Text>;
}

/* ---------------- Screen (暗色背景容器，带进入转场) ---------------- */
export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(320)} style={[styles.screen, { backgroundColor: t.bg }, style]}>
      {children}
    </Animated.View>
  );
}

/* ---------------- SuccessMsg (成功/失败提示，BounceIn 回弹) ---------------- */
export function FlashMsg({
  msg,
}: {
  msg: { kind: 'ok' | 'err'; text: string };
}) {
  return (
    <Animated.View
      entering={BounceIn.duration(420)}
      style={[styles.msg, { backgroundColor: msg.kind === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }]}
    >
      <Text style={{ color: msg.kind === 'ok' ? colors.success : colors.danger }}>{msg.text}</Text>
    </Animated.View>
  );
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
  buttonWrap: {
    borderRadius: radius.pill,
  },
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
    overflow: 'hidden',
  },
  oddsPress: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  oddsFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.md,
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
  msg: {
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 16,
  },
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  promoTitle: {
    color: '#F4F6FF',
    fontSize: 17,
    fontWeight: '800',
  },
  promoDesc: {
    color: '#9AA3C0',
    fontSize: 13,
    marginTop: 4,
  },
  promoBonus: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(6,182,212,0.15)',
  },
  promoBonusText: {
    color: '#06B6D4',
    fontSize: 12,
    fontWeight: '800',
  },
  promoClaimBtn: {
    marginLeft: 12,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  promoClaimed: {
    marginLeft: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  bannerIcon: { fontSize: 16, marginRight: 8 },
  bannerText: { color: '#F4F6FF', fontSize: 13, flex: 1 },
});

export type { ViewStyle, TextStyle };
