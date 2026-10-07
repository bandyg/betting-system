import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from './theme';
import { fontSize, radius, spacing } from './tokens';

/* ---------------- Input ---------------- */

export function Input({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  onSubmitEditing,
  multiline,
  autoFocus,
  testID,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'email-address';
  onSubmitEditing?: () => void;
  multiline?: boolean;
  autoFocus?: boolean;
  testID?: string;
  style?: object;
}) {
  const t = useTheme();
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={t.textMuted}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      onSubmitEditing={onSubmitEditing}
      multiline={multiline}
      autoFocus={autoFocus}
      style={[
        {
          backgroundColor: t.bg,
          borderColor: t.borderStrong,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: multiline ? spacing.md : 8,
          color: t.text,
          fontSize: fontSize.md,
          minWidth: 120,
        },
        style,
      ]}
    />
  );
}

/* ---------------- Select（Modal 选择器，跨端一致 + testID 可测） ---------------- */

export interface SelectOption<V = string> {
  value: V;
  label: string;
}

export function Select<V extends string | number>({
  value,
  options,
  onChange,
  placeholder = '请选择',
  testID,
  style,
}: {
  value: V | null;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  placeholder?: string;
  testID?: string;
  style?: object;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={[{ minWidth: 140 }, style]}>
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: t.bg,
          borderColor: t.borderStrong,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: 8,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        <Text numberOfLines={1} style={{ color: current ? t.text : t.textMuted, fontSize: fontSize.md, flexShrink: 1 }}>
          {current?.label ?? placeholder}
        </Text>
        <Text style={{ color: t.textMuted }}>▾</Text>
      </Pressable>
      {open && (
        <View
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            backgroundColor: t.bgElevated,
            borderColor: t.border,
            borderWidth: 1,
            borderRadius: radius.md,
            zIndex: 100,
            maxHeight: 260,
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
            overflow: 'hidden',
          }}
        >
          {options.map((o) => (
            <Pressable
              key={String(o.value)}
              testID={testID ? `${testID}-option-${o.value}` : `select-option-${o.value}`}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={({ pressed }) => ({
                paddingHorizontal: spacing.md,
                paddingVertical: 8,
                backgroundColor: pressed ? t.border : o.value === value ? t.oddsActiveBg : 'transparent',
              })}
            >
              <Text style={{ color: o.value === value ? t.secondary : t.text, fontSize: fontSize.md }}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
