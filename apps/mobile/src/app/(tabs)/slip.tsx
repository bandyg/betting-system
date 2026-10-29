import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { api, useBetSlip, useCurrentUser } from '@betting/core';
import { Screen, spacing, EmptyState, SectionTitle } from '@betting/ui';
import { SlipPanel } from '../../components/slip-panel';

export default function SlipScreen() {
  const slip = useBetSlip();
  const { user, update } = useCurrentUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // 登录态变化后清掉旧提示：此前未登录时点的「请先登录」红条在登录成功后仍挂着
  useEffect(() => {
    if (user) setMsg((prev) => (prev && prev.text.includes('登录') ? null : prev));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 页面从 keep-alive 堆叠里切回时同步一次余额，避免展示陈旧资金数据
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (user) {
        api
          .getUser(user.id)
          .then((fresh) => {
            if (!cancelled) update({ ...user, ...fresh.user });
          })
          .catch(() => {
            // 静默：余额刷新失败不打断页面
          });
      }
      return () => {
        cancelled = true;
      };
    }, [user?.id]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <Screen maxWidth={560}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <SectionTitle>下注单</SectionTitle>
        </View>

        {slip.items.length === 0 && !msg && (
          <EmptyState
            iconName="ticket"
            title="还没有选中的赔率"
            desc="回到赛事页，点一下想投的赔率即可加入下注单"
            actionLabel="去赛事页"
            onAction={() => router.push('/')}
          />
        )}

        <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          <SlipPanel onMsgChange={setMsg} />
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = { safe: { flex: 1 } as const };
