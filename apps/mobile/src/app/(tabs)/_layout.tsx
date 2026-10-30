// 玩家端 Tab 导航（(tabs) route group —— URL 不带 group 前缀）
// v3 sportsbook 视觉：品牌绿渐变头部（logo/余额/充值）全形态常驻；
// - ≥1024 桌面 webapp：头部下方 [左侧导航+热门运动树 │ 内容]，隐藏底部 tab
// - 560~1023 壳档：自适应宽列居中（min(视口-32, 760)）+ 暗背底 + 底部 tab（SVG 图标）
// - <560 原生手机：全幅 + 底部 tab
import { Pressable, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import {
  sbColors as colors,
  Icon, SbBolt, SportIcon,
  APP_SHELL_MIN_VIEWPORT, DESKTOP_MIN_VIEWPORT, shellMaxWidth,
} from '@betting/ui';
import { useBetSlip, useCurrentUser, useSports } from '@betting/core';
import { usePins } from '../../lib/pins';
import { sportLabel } from '../../lib/sport-display';

/** 头部以下、窄屏手机壳的场景底色 */
const SHELL_BACKDROP = '#0D0D0D';

const NAV_ITEMS = [
  { route: '/', label: '赛事', icon: 'calendar' as const },
  { route: '/promo', label: '促销', icon: 'gift' as const },
  { route: '/slip', label: '下注单', icon: 'ticket' as const },
  { route: '/account', label: '我的', icon: 'user' as const },
] as const;

/** 品牌绿渐变头部：全形态常驻（余额芯片 + 充值主按钮） */
function GreenHeader({ compact }: { compact?: boolean }) {
  const { user } = useCurrentUser();
  const router = useRouter();
  return (
    <View style={[styles.hdr, compact && { height: 46 }]}>
      <View style={styles.logo}>
        <View style={styles.boltTile}>
          <SbBolt size={compact ? 13 : 15} />
        </View>
        <Text style={styles.logoText}>BET PLAY</Text>
      </View>
      <View style={styles.hdrSp} />
      {user ? (
        <>
          <View style={styles.balChip}>
            <Text style={styles.balText}>¥{(user.balance ?? 0).toLocaleString('zh-CN')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/account')}
            style={({ pressed }) => [styles.depBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.depText}>充值</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/account')}
          style={({ pressed }) => [styles.depBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={styles.depText}>登录 / 注册</Text>
        </Pressable>
      )}
    </View>
  );
}

function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const slip = useBetSlip();
  const pins = usePins();
  const sports = useSportsCounts();
  return (
    <View style={styles.sidebar}>
      <View style={styles.sbCapWrap}><Text style={styles.sbCap}>导航</Text></View>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.route;
        return (
          <Pressable
            key={item.route}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => router.navigate(item.route)}
            style={({ pressed }) => [
              styles.sbItem,
              active && styles.sbItemActive,
              { opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Icon name={item.icon} size={15} color={active ? colors.text : colors.textSecondary} />
            <Text style={[styles.sbItemLabel, { color: active ? colors.text : colors.textSecondary }]}>
              {item.label}
            </Text>
            {item.route === '/slip' && slip.items.length > 0 ? (
              <View style={styles.sbBadge}>
                <Text style={styles.sbBadgeText}>{slip.items.length}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <View style={styles.sbSep} />
      <View style={styles.sbCapWrap}><Text style={styles.sbCap}>我的关注</Text></View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.navigate('/')}
        style={({ pressed }) => [styles.sbItem, { opacity: pressed ? 0.75 : 1 }]}
      >
        <Icon name="star" size={15} color={colors.accent} />
        <Text style={[styles.sbItemLabel, { color: colors.textSecondary }]}>钉选的赛事</Text>
        {pins.count > 0 ? <Text style={styles.sbN}>{pins.count}</Text> : null}
      </Pressable>
      <View style={styles.sbSep} />
      <View style={styles.sbCapWrap}><Text style={styles.sbCap}>热门运动</Text></View>
      {sports.map((s) => (
        <View key={s.sport} style={styles.sbSport}>
          <View style={styles.sbSportL}>
            <SportIcon sport={s.sport} size={14} color={colors.textSecondary} />
            <Text style={styles.sbSportLabel}>{s.label}</Text>
          </View>
          <Text style={styles.sbN}>{s.count}</Text>
        </View>
      ))}
      <View style={styles.sbFoot}>
        <Text style={styles.sbFootText}>演示环境 · 模拟支付</Text>
      </View>
    </View>
  );
}

/** 热门运动计数（/sports 与大厅同口径） */
function useSportsCounts(): Array<{ sport: string; label: string; count: number }> {
  const { data } = useSports();
  const sports = data?.sports ?? [];
  return sports.slice(0, 6).map((s) => ({
    sport: s.sport,
    label: sportLabel(s.sport),
    count: s.leagues.reduce((sum, l) => sum + l.count, 0),
  }));
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
        <GreenHeader />
        <View style={styles.desktopBody}>
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
      </View>
    );
  }

  return (
    <View style={styles.mobileRoot}>
      <GreenHeader compact />
      <View style={styles.mobileTabs}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarStyle: {
              backgroundColor: colors.bgElevated,
              borderTopColor: colors.border,
              // web 端高度过矮会把图标下的文字标签挤成 2px（RN-web flex 压缩），至少留 icon 19 + label 12 + 余量
              height: Platform.OS === 'web' ? 66 : 84,
              paddingBottom: Platform.OS === 'web' ? 8 : 24,
              paddingTop: 7,
              ...(shell
                ? {
                    width: '100%',
                    maxWidth: shellMaxWidth(width),
                    alignSelf: 'center',
                    borderLeftWidth: 1,
                    borderRightWidth: 1,
                    borderColor: colors.border,
                  }
                : {}),
            },
            tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700', lineHeight: 13 },
            sceneStyle: { backgroundColor: shell ? SHELL_BACKDROP : colors.bg },
          }}
        >
          <Tabs.Screen name="index" options={{ title: '赛事', tabBarIcon: ({ color }) => <Icon name="calendar" size={19} color={color} /> }} />
          <Tabs.Screen name="promo" options={{ title: '促销', tabBarIcon: ({ color }) => <Icon name="gift" size={19} color={color} /> }} />
          <Tabs.Screen
            name="slip"
            options={{
              title: '下注单',
              tabBarBadge: slipBadge,
              tabBarIcon: ({ color }) => <Icon name="ticket" size={19} color={color} />,
            }}
          />
          <Tabs.Screen name="account" options={{ title: '我的', tabBarIcon: ({ color }) => <Icon name="user" size={19} color={color} /> }} />
          <Tabs.Screen name="support" options={{ href: null }} />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileRoot: { flex: 1, backgroundColor: colors.bg },
  mobileTabs: { flex: 1 },
  desktopRoot: { flex: 1, backgroundColor: colors.bg },
  desktopBody: { flex: 1, flexDirection: 'row', minHeight: 0 },
  desktopContent: { flex: 1, minWidth: 0 },
  hdr: {
    height: 52,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boltTile: {
    width: 26,
    height: 26,
    borderRadius: 5,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.8 },
  hdrSp: { flex: 1 },
  balChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  balText: { color: '#fff', fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] as const },
  depBtn: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  depText: { color: '#1B1B00', fontWeight: '900', fontSize: 12 },
  sidebar: {
    width: 210,
    backgroundColor: colors.bgElevated,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  sbCapWrap: { paddingHorizontal: 9, paddingTop: 8, paddingBottom: 6 },
  sbCap: { fontSize: 10, letterSpacing: 1.4, color: colors.textMuted, fontWeight: '800' },
  sbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 3,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    marginBottom: 1,
  },
  sbItemActive: {
    backgroundColor: colors.bgGlass,
    borderLeftColor: colors.accent,
  },
  sbItemLabel: { fontSize: 12, fontWeight: '600', flex: 1 },
  sbBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  sbBadgeText: { color: '#1B1B00', fontSize: 10, fontWeight: '900' },
  sbSep: { height: 1, backgroundColor: colors.border, marginVertical: 8, marginHorizontal: 4 },
  sbSport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 3,
  },
  sbSportL: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sbSportLabel: { color: colors.textSecondary, fontSize: 12 },
  sbN: { color: colors.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] as const },
  sbFoot: { marginTop: 'auto', paddingHorizontal: 9, paddingBottom: 14 },
  sbFootText: { color: colors.textMuted, fontSize: 10.5 },
});
