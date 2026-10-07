// admin 路由组布局：角色门禁 + 顶栏 + 导航 + 全局浮层（Toast/客服/离线横幅/快捷键）
// 注意：滚动由各页面自行处理（navigator 不可嵌在 ScrollView 内）
import React from 'react';
import { View } from 'react-native';
import { Stack, usePathname, useRouter, Redirect } from 'expo-router';
import { ThemeProvider, TabsNav, ToastHost, SupportChat, OfflineBanner, useTheme } from '@betting/ui';
import { useAuth } from '@betting/core';
import { useThemeStore } from '@/stores/theme';
import { AdminHeader } from '@/admin/chrome';
import { KeyboardProvider } from '@/admin/keyboard';

const ADMIN_TABS = [
  { key: 'matches', label: '⚽ 大厅' },
  { key: 'history', label: '📋 注单' },
  { key: 'accounts', label: '👤 账户' },
  { key: 'create', label: '🏟️ 建赛' },
  { key: 'settle', label: '💰 结算' },
  { key: 'feed', label: '📡 Feed' },
  { key: 'support', label: '🎫 工单' },
];

export default function AdminLayout() {
  const pathname = usePathname(); // /admin/xxx
  const router = useRouter();
  const { user } = useAuth();
  const themeStore = useThemeStore();
  const t = useTheme();

  const isLogin = pathname.endsWith('/login');
  const allowed = !!user && (user.role === 'admin' || user.role === 'support');

  // 未登录/角色不符 → 登录页（登录页除外）
  if (!isLogin && !allowed) return <Redirect href="/admin/login" />;

  const role = user?.role;
  const tabs = role === 'support' ? ADMIN_TABS.filter((x) => x.key === 'support') : ADMIN_TABS;
  const active = pathname.split('/').pop() || 'matches';

  return (
    <ThemeProvider mode={themeStore.mode} onModeChange={themeStore.setMode}>
      <KeyboardProvider>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <OfflineBanner />
          {!isLogin ? <AdminHeader /> : null}
          {!isLogin ? <TabsNav tabs={tabs} active={role === 'support' ? 'support' : active} onChange={(key) => router.push(`/admin/${key}`)} /> : null}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flex: 1, width: '100%', maxWidth: 1280 }}>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
            </View>
          </View>
          <ToastHost />
          <SupportChat userName={user?.name} />
        </View>
      </KeyboardProvider>
    </ThemeProvider>
  );
}

