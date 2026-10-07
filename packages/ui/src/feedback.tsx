import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useTheme } from './theme';
import { fontSize, radius } from './tokens';

/**
 * OfflineBanner —— 离线/恢复横幅
 * netinfo 订阅（web 端内部走 navigator.onLine）；恢复连接后显示 2.5s "已恢复" 再淡出。
 */
export function OfflineBanner() {
  const t = useTheme();
  const [online, setOnline] = useState<boolean | null>(null); // null = 未知（首帧不显示）
  const [justRecovered, setJustRecovered] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isConnected = !!state.isConnected;
      setOnline((prev) => {
        if (prev === false && isConnected) {
          wasOffline.current = false;
          setJustRecovered(true);
          setTimeout(() => setJustRecovered(false), 2500);
        }
        if (!isConnected) wasOffline.current = true;
        return isConnected;
      });
    });
    return () => unsub();
  }, []);

  if (online !== false && !justRecovered) return null;
  const recovered = online !== false;
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutUp.duration(200)}
      testID="offline-banner"
      style={{
        backgroundColor: recovered ? t.success : t.danger,
        paddingVertical: 4,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: '700' }}>
        {recovered ? '✓ 连接已恢复' : '⚠ 网络已断开，显示的可能是过期数据'}
      </Text>
    </Animated.View>
  );
}

/* ---------------- ErrorBoundary（应用根级兜底） ---------------- */

interface EBProps {
  children: React.ReactNode;
}
interface EBState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<EBProps, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // 上报交给全局 handler（errorReporter），这里只兜 UI
    if (Platform.OS === 'web') console.error('[ErrorBoundary]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const t = { text: '#F4F6FF', textMuted: '#9AA3C0', secondary: '#06B6D4', border: 'rgba(124,58,237,0.3)', bgElevated: '#131A2E' };
    return (
      <View style={{ flex: 1, backgroundColor: '#0B0F1A', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ backgroundColor: t.bgElevated, borderColor: t.border, borderWidth: 1, borderRadius: radius.lg, padding: 24, maxWidth: 560, gap: 12 }}>
          <Text style={{ color: '#EF4444', fontSize: 40 }}>💥</Text>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>页面出错了</Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>{String(this.state.error?.message ?? this.state.error)}</Text>
          {Platform.OS === 'web' ? (
            <Pressable
              testID="error-reload"
              onPress={() => window.location.reload()}
              style={{ alignSelf: 'flex-start', backgroundColor: t.secondary, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>刷新页面</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
}
