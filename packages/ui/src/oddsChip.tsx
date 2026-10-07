import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from './theme';
import { fontSize, radius } from './tokens';

/**
 * OddsChip —— 大厅/盘口赔率筹码
 * - selected：选中态（在投注单中）
 * - flash='up'|'down'：实时调价闪烁（1.2s 边框脉冲，绿升红降）
 */
export function OddsChip({
  label,
  price,
  selected,
  flash,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  price: number;
  selected?: boolean;
  flash?: 'up' | 'down' | null;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const pulse = useSharedValue(0);
  const flashTone = useSharedValue(0); // 0 none, 1 up, -1 down

  useEffect(() => {
    if (flash === 'up') flashTone.value = 1;
    else if (flash === 'down') flashTone.value = -1;
    else return;
    pulse.value = withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 900 }));
    const reset = setTimeout(() => {
      flashTone.value = 0;
    }, 1200);
    return () => clearTimeout(reset);
  }, [flash, pulse, flashTone]);

  const aStyle = useAnimatedStyle(() => {
    const toneColor = flashTone.value > 0.5 ? t.success : flashTone.value < -0.5 ? t.danger : t.borderStrong;
    const glow = pulse.value;
    return {
      borderColor: toneColor,
      borderWidth: 1.5 + glow,
      transform: [{ scale: 1 + glow * 0.05 }],
      opacity: 1 - glow * 0.15,
    };
  });

  return (
    <Pressable
      testID={testID ?? `odds-${label}`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}
    >
      <Animated.View
        style={[
          aStyle,
          {
            backgroundColor: selected ? t.oddsActiveBg : t.oddsBg,
            borderRadius: radius.md,
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignItems: 'center',
            minWidth: 64,
          },
        ]}
      >
        <Text style={{ color: t.textMuted, fontSize: fontSize.xs, fontWeight: '600' }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          {flash === 'up' ? <Text style={{ color: t.success, fontSize: fontSize.xs }}>▲</Text> : null}
          {flash === 'down' ? <Text style={{ color: t.danger, fontSize: fontSize.xs }}>▼</Text> : null}
          <Text style={{ color: selected ? t.secondary : t.text, fontSize: fontSize.md, fontWeight: '800' }}>
            {price.toFixed(2)}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
