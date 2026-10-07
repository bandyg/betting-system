// 玩家端 Tab 导航（(tabs) route group —— URL 不带 group 前缀）
import { Tabs } from 'expo-router';
import { Platform, Text } from 'react-native';
import { colors } from '@betting/ui';

function EmojiIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
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
    </Tabs>
  );
}
