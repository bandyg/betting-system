import { useEffect } from 'react';
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

// Web 专用：浏览器默认滚动条（粗、亮色）压在 dark neon 主题上非常突兀。
// RN-Web 无法表达伪元素，只能在运行时注入 <style>。
// 页面级（html/body）滚动条整个隐藏——App 式 UI，滚轮/触摸/键盘照常滚动；
// 内部滚动容器（admin 表格等）保留 6px 细条，颜色取 textSecondary(#9AA3C0) 35% 透明。
const WEB_SCROLLBAR_CSS = `
  * { scrollbar-width: thin; scrollbar-color: rgba(154,163,192,0.35) transparent; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(154,163,192,0.35); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(154,163,192,0.55); }
  ::-webkit-scrollbar-corner { background: transparent; }
  html, body { scrollbar-width: none; overflow-x: hidden; background: #04060D; }
  html::-webkit-scrollbar, body::-webkit-scrollbar { width: 0; height: 0; }
  /* expo-router（SDK57）内置 react-navigation 的导航容器底色硬编码浅色主题 #F2F2F2，
     会在手机壳底部导航两侧露出一条浅色带。userInterfaceStyle=dark 对打包内置的
     导航主题不生效，设计系统也从未使用该颜色，运行时按内联样式精准压成场景背底。 */
  [style*="rgb(242,242,242)"], [style*="rgb(242, 242, 242)"] { background-color: #04060D !important; }
`;

// 根导航：Stack —— 玩家端 (tabs) group 与运营后台 admin group 互不嵌套
// （此前 admin 挂在根 Tabs 下，玩家端底部 TabBar 会悬浮在 admin 页面上拦截点击）
export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.id = 'global-scrollbar';
    style.textContent = WEB_SCROLLBAR_CSS;
    document.head.appendChild(style);
  }, []);

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
