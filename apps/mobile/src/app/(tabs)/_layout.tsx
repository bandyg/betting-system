// 玩家端 Tab 导航（(tabs) route group —— URL 不带 group 前缀）
import { Tabs } from 'expo-router';
import { Platform, Text, useWindowDimensions } from 'react-native';
import { colors, APP_SHELL_MAX_WIDTH, APP_SHELL_MIN_VIEWPORT } from '@betting/ui';
import { useBetSlip } from '@betting/core';

/** 宽屏 web 的场景底色：比页面底色更暗，把居中的手机壳 column 衬托出来 */
const SHELL_BACKDROP = '#04060D';

function EmojiIcon({ emoji }: { emoji: string }) {
  // aria-hidden：否则读屏会把它和标题一起念，出现「⚽ ⚽ 赛事」的重复朗读
  return <Text style={{ fontSize: 20 }} aria-hidden accessible={false}>{emoji}</Text>;
}

export default function TabsLayout() {
  // 下注单角标：跨页共享的 slip 单例，选中赔率后 tab 上直接可见数量
  const slip = useBetSlip();
  const slipBadge = slip.items.length > 0 ? slip.items.length : undefined;
  // 宽屏 web：整个应用壳（内容列 + 底部导航）限宽居中，场景底色调暗衬托
  const { width } = useWindowDimensions();
  const shell = Platform.OS === 'web' && width > APP_SHELL_MIN_VIEWPORT;
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
          ...(shell
            ? {
                width: '100%',
                maxWidth: APP_SHELL_MAX_WIDTH,
                alignSelf: 'center',
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: colors.border,
              }
            : {}),
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        sceneStyle: { backgroundColor: shell ? SHELL_BACKDROP : colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '赛事', tabBarIcon: () => <EmojiIcon emoji="⚽" /> }} />
      <Tabs.Screen name="promo" options={{ title: '促销', tabBarIcon: () => <EmojiIcon emoji="🎁" /> }} />
      <Tabs.Screen
        name="slip"
        options={{
          title: '下注单',
          tabBarBadge: slipBadge,
          tabBarIcon: () => <EmojiIcon emoji="🎫" />,
        }}
      />
      <Tabs.Screen name="account" options={{ title: '我的', tabBarIcon: () => <EmojiIcon emoji="👤" /> }} />
      <Tabs.Screen name="support" options={{ href: null }} />
    </Tabs>
  );
}
