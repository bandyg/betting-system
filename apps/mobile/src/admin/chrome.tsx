// admin 顶栏：标题 / 用户问候+余额 / 主题切换 / 登出 / 快捷键帮助按钮（?）
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar, useTheme, useThemeMode, fontSize, spacing } from '@betting/ui';
import { useAuth } from '@betting/core';

export function AdminHeader() {
  const t = useTheme();
  const { mode, setMode } = useThemeMode();
  const { user, logout } = useAuth();

  return (
    <View
      testID="admin-header"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        height: 56,
        backgroundColor: t.bgElevated,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <Text style={{ color: t.secondary, fontSize: fontSize.lg, fontWeight: '900' }}>Betting Admin</Text>
      <View style={{ flex: 1 }} />
      {user ? (
        <>
          <Avatar name={user.name} size={28} />
          <View>
            <Text style={{ color: t.text, fontSize: fontSize.sm, fontWeight: '700' }}>
              {user.name}
              <Text style={{ color: t.textMuted }}> · {user.role}</Text>
            </Text>
            <Text style={{ color: t.success, fontSize: fontSize.xs }}>¥{user.balance}</Text>
          </View>
          <Pressable testID="theme-toggle" onPress={() => setMode(mode === 'dark' ? 'light' : 'dark')} hitSlop={8}>
            <Text style={{ fontSize: 16 }}>{mode === 'dark' ? '🌙' : '☀️'}</Text>
          </Pressable>
          <Pressable
            testID="logout-btn"
            onPress={logout}
            hitSlop={8}
            style={{ paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 8, borderColor: t.border, borderWidth: 1 }}
          >
            <Text style={{ color: t.textSecondary, fontSize: fontSize.xs, fontWeight: '700' }}>登出</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
