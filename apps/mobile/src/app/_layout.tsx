import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, ErrorBoundary, colors } from '@betting/ui';
import { setApiBase, restoreSession, restoreSessionAsync, setAuthStorage } from '@betting/core';
import { setupErrorReporter } from '@/lib/errorReporter';

// API 地址分端策略（unify-frontend-expo）：
// - Web：默认相对 '/api'（serve-web.mjs 同源反代到 :4100），WS 同理由 /ws 反代
// - Native（iOS/Android）：直连绝对地址（CORS 已放行 *），可用 EXPO_PUBLIC_API_BASE 覆盖
if (Platform.OS !== 'web') {
  setApiBase(process.env.EXPO_PUBLIC_API_BASE ?? 'http://100.66.5.26:4100/api');
  setAuthStorage(AsyncStorage);
  void restoreSessionAsync();
} else {
  restoreSession();
}

setupErrorReporter();

function EmojiIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="light" />
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: colors.secondary,
              tabBarInactiveTintColor: colors.textMuted,
              tabBarStyle: {
                backgroundColor: colors.bgElevated,
                borderTopColor: colors.border,
                height: Platform.OS === 'web' ? 64 : 84,
                paddingBottom: Platform.OS === 'web' ? 12 : 24,
                paddingTop: 8,
              },
              tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
              sceneStyle: { backgroundColor: colors.bg },
            }}
          >
            <Tabs.Screen name="index" options={{ title: '赛事', tabBarIcon: () => <EmojiIcon emoji="⚽" /> }} />
            <Tabs.Screen name="promo" options={{ title: '促销', tabBarIcon: () => <EmojiIcon emoji="🎁" /> }} />
            <Tabs.Screen name="slip" options={{ title: '下注单', tabBarIcon: () => <EmojiIcon emoji="🎫" /> }} />
            <Tabs.Screen name="account" options={{ title: '我的', tabBarIcon: () => <EmojiIcon emoji="👤" /> }} />
            <Tabs.Screen name="support" options={{ href: null }} />
            {/* admin 路由组：不出现在玩家端 Tab，通过 /admin 直达 */}
            <Tabs.Screen name="admin" options={{ href: null }} />
          </Tabs>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
