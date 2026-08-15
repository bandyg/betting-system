import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, colors } from '@betting/ui';
import { setApiBase, restoreSession } from '@betting/core';

// 所有端都直连 API（Tailscale IP，CORS 已放行 *）
// - Native（iOS/Android）不能走相对路径
// - Expo Web 没有 vite proxy，/api 会打到自身 → 也用绝对地址
setApiBase('http://100.66.5.26:4100/api');

// 启动时恢复 web 端登录态（localStorage）
restoreSession();

function EmojiIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

export default function RootLayout() {
  return (
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
        </Tabs>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
