import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, ErrorBoundary } from '@betting/ui';
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

// 根导航：Stack —— 玩家端 (tabs) group 与运营后台 admin group 互不嵌套
// （此前 admin 挂在根 Tabs 下，玩家端底部 TabBar 会悬浮在 admin 页面上拦截点击）
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
