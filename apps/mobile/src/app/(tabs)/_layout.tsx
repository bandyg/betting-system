// 玩家端 Tab 导航（(tabs) route group —— URL 不带 group 前缀）
// web 三档形态：
// - ≥1024 桌面 webapp：左侧固定导航栏 + 隐藏底部 tab，内容全幅（下注单走大厅右侧 dock）
// - 560~1023 手机壳：430 居中 + 暗背底
// - <560 原生手机：全幅 + 底部 tab
import { Pressable, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import {
  colors,
  APP_SHELL_MAX_WIDTH,
  APP_SHELL_MIN_VIEWPORT,
  DESKTOP_MIN_VIEWPORT,
} from '@betting/ui';
import { useBetSlip } from '@betting/core';

/** 宽屏 web 的场景底色：比页面底色更暗，把居中的手机壳 column 衬托出来 */
const SHELL_BACKDROP = '#04060D';

function EmojiIcon({ emoji }: { emoji: string }) {
  // aria-hidden：否则读屏会把它和标题一起念，出现「⚽ ⚽ 赛事」的重复朗读
  return <Text style={{ fontSize: 20 }} aria-hidden accessible={false}>{emoji}</Text>;
}

const NAV_ITEMS = [
  { route: '/', label: '赛事', emoji: '⚽' },
  { route: '/promo', label: '促销', emoji: '🎁' },
  { route: '/slip', label: '下注单', emoji: '🎫' },
  { route: '/account', label: '我的', emoji: '👤' },
] as const;

function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const slip = useBetSlip();
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarBrand}>
        <Text style={styles.sidebarBrandTitle}>⚡ BET PLAY</Text>
        <Text style={styles.sidebarBrandSub}>赛前固定赔率 · 立即下注</Text>
      </View>
      <View style={styles.sidebarNav}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.route;
          return (
            <Pressable
              key={item.route}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => router.navigate(item.route)}
              style={({ pressed }) => [
                styles.sidebarItem,
                active && styles.sidebarItemActive,
                { opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Text style={styles.sidebarItemIcon}>{item.emoji}</Text>
              <Text style={[styles.sidebarItemLabel, { color: active ? colors.secondary : colors.textSecondary }]}>
                {item.label}
              </Text>
              {item.route === '/slip' && slip.items.length > 0 ? (
                <View style={styles.sidebarBadge}>
                  <Text style={styles.sidebarBadgeText}>{slip.items.length}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.sidebarFoot}>
        <Text style={styles.sidebarFootText}>演示环境 · 模拟支付</Text>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  // 下注单角标：跨页共享的 slip 单例，选中赔率后导航上直接可见数量
  const slip = useBetSlip();
  const slipBadge = slip.items.length > 0 ? slip.items.length : undefined;
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const desktop = web && width >= DESKTOP_MIN_VIEWPORT;
  const shell = web && !desktop && width > APP_SHELL_MIN_VIEWPORT;

  if (desktop) {
    return (
      <View style={styles.desktopRoot}>
        <DesktopSidebar />
        <View style={styles.desktopContent}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
              sceneStyle: { backgroundColor: colors.bg },
            }}
          >
            <Tabs.Screen name="index" options={{ title: '赛事' }} />
            <Tabs.Screen name="promo" options={{ title: '促销' }} />
            <Tabs.Screen name="slip" options={{ title: '下注单' }} />
            <Tabs.Screen name="account" options={{ title: '我的' }} />
            <Tabs.Screen name="support" options={{ href: null }} />
          </Tabs>
        </View>
      </View>
    );
  }

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

const styles = StyleSheet.create({
  desktopRoot: { flex: 1, flexDirection: 'row', backgroundColor: '#04060D' },
  desktopContent: { flex: 1, minWidth: 0 },
  sidebar: {
    width: 216,
    backgroundColor: colors.bgElevated,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: 24,
    paddingHorizontal: 12,
  },
  sidebarBrand: { paddingHorizontal: 12, marginBottom: 28 },
  sidebarBrandTitle: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  sidebarBrandSub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  sidebarNav: { gap: 4 },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
  },
  sidebarItemActive: { backgroundColor: colors.oddsActiveBg },
  sidebarItemIcon: { fontSize: 17 },
  sidebarItemLabel: { fontSize: 14, fontWeight: '700', flex: 1 },
  sidebarBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  sidebarBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sidebarFoot: { marginTop: 'auto', paddingHorizontal: 12, paddingBottom: 16 },
  sidebarFootText: { color: colors.textMuted, fontSize: 11 },
});
