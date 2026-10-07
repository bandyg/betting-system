import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBetSlip, useCurrentUser, useBets, placeBetItems, placeParlayItems } from '@betting/core';
import { Card, Screen, Button, FlashMsg, colors, radius, fontSize, font, spacing, EmptyState, SectionTitle } from '@betting/ui';

export default function SlipScreen() {
  const slip = useBetSlip();
  const { user } = useCurrentUser();
  const bets = useBets(user?.id);
  const [stake, setStake] = useState('100');
  const [parlay, setParlay] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async () => {
    if (!user) {
      setMsg({ kind: 'err', text: '请先到「我的」页登录' });
      return;
    }
    if (slip.items.length === 0) {
      setMsg({ kind: 'err', text: '下注单是空的' });
      return;
    }
    const amount = Number(stake);
    if (!amount || amount <= 0) {
      setMsg({ kind: 'err', text: '请输入有效金额' });
      return;
    }
    if (parlay && slip.items.length < 2) {
      setMsg({ kind: 'err', text: '串关至少需要 2 个选择' });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      if (parlay) {
        const result = await placeParlayItems(slip.items, amount);
        setMsg({ kind: 'ok', text: `✅ 串关下注成功（${slip.items.length} 串），余额 ¥${result.balance}` });
      } else {
        const results = await placeBetItems(user.id, slip.items.map((i) => ({ ...i, stake: amount })));
        setMsg({ kind: 'ok', text: `✅ 下注成功 ${results.length} 单，余额 ¥${results[results.length - 1].balance}` });
      }
      slip.clear();
      setParlay(false);
      bets.refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const combinedOdds = slip.items.reduce((s, i) => s * i.price, 1);
  const totalStake = Number(stake || 0) * (parlay ? 1 : slip.items.length);
  const projectedPayout = parlay ? totalStake * combinedOdds : slip.items.reduce((s, i) => s + Number(stake || 0) * i.price, 0);

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <SectionTitle>🎫 下注单</SectionTitle>
        </View>

        {slip.items.length === 0 && !msg && <EmptyState text="还没有选中的赔率，去赛事页点一下赔率" />}

        {msg && <FlashMsg msg={msg} />}

        {slip.items.length > 0 && (
          <>
            <FlatList
              removeClippedSubviews={false}
              data={slip.items}
              keyExtractor={(i) => `${i.marketId}-${i.selection}`}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Card style={styles.slipItem} glass>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slipLabel}>{item.label}</Text>
                    <Text style={styles.slipPrice}>@{item.price.toFixed(2)}</Text>
                  </View>
                  <Pressable onPress={() => slip.remove(item.marketId, item.selection)} hitSlop={8}>
                    <Text style={styles.remove}>✕</Text>
                  </Pressable>
                </Card>
              )}
            />

            <View style={styles.footer}>
              {slip.items.length >= 2 && (
                <Pressable style={styles.parlayToggle} onPress={() => setParlay(!parlay)}>
                  <View style={[styles.parlayBox, parlay && styles.parlayBoxOn]}>
                    {parlay && <Text style={styles.parlayCheck}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.parlayLabel}>串关模式（{slip.items.length} 串）</Text>
                    <Text style={styles.parlaySub}>
                      {parlay ? `连乘赔率 @${combinedOdds.toFixed(2)} · 整单金额` : '所有选择合成一注，任一失败整单输'}
                    </Text>
                  </View>
                </Pressable>
              )}
              <View style={styles.stakeRow}>
                <Text style={styles.stakeLabel}>{parlay ? '串关金额' : '每单金额'}</Text>
                <TextInput
                  value={stake}
                  onChangeText={setStake}
                  keyboardType="numeric"
                  style={styles.stakeInput}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryText}>
                  {parlay ? `串关 ${slip.items.length} 场 · 预估回报` : `共 ${slip.items.length} 单 · 预估回报`}
                </Text>
                <Text style={styles.payout}>
                  ¥{projectedPayout.toLocaleString()}
                </Text>
              </View>
              <Button title={submitting ? '提交中…' : `确认下注 ¥${totalStake.toLocaleString()}`} onPress={submit} loading={submitting} />
              {!user && <Text style={styles.hint}>⚠️ 未登录，下注前请到「我的」页登录</Text>}
            </View>
          </>
        )}
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  listContent: { padding: spacing.lg, paddingBottom: 20 },
  slipItem: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  slipLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: font.bold },
  slipPrice: { color: colors.secondary, fontSize: fontSize.md, marginTop: 4 },
  remove: { color: colors.danger, fontSize: fontSize.xl, paddingHorizontal: 8 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  stakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  stakeLabel: { color: colors.textSecondary, fontSize: fontSize.md },
  stakeInput: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: font.bold,
    minWidth: 120,
    textAlign: 'right',
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  summaryText: { color: colors.textSecondary, fontSize: fontSize.sm },
  payout: { color: colors.success, fontSize: fontSize.xl, fontWeight: font.bold },
  hint: { color: colors.warning, fontSize: fontSize.sm, marginTop: spacing.sm, textAlign: 'center' },
  parlayToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  parlayBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parlayBoxOn: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  parlayCheck: { color: colors.text, fontSize: fontSize.sm, fontWeight: font.bold },
  parlayLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: font.bold },
  parlaySub: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
});
