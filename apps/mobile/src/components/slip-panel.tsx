/**
 * SlipPanel — 下注单提交面板（唯一资金提交路径，两处复用）：
 * - /slip 页整页使用；
 * - 桌面 webapp（≥1024）大厅右侧 dock 使用（选中赔率后即时结算，无需跳页）。
 * 含串关切换、每单金额、预估回报、未登录提示与提交反馈。
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useBetSlip, useCurrentUser, useBets, placeBetItems, placeParlayItems } from '@betting/core';
import { Card, Button, FlashMsg, colors, radius, fontSize, font, spacing } from '@betting/ui';
import { formatKickoffLocal } from '../lib/datetime';

export interface SlipPanelProps {
  /** dock 场景：紧凑排版 */
  slim?: boolean;
  /** 提交反馈变化时上抛（dock 用它决定面板驻留） */
  onMsgChange?: (msg: { kind: 'ok' | 'err'; text: string } | null) => void;
}

/** 服务端部分校验错误是英文（如 insufficient balance: have 0, need 100），面板层转成用户可读文案 */
function localizeBetError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/insufficient balance: have ([\d.]+), need ([\d.]+)/);
  if (m) return `余额不足：当前 ¥${Number(m[1])}，本次需要 ¥${Number(m[2])}`;
  return raw;
}

export function SlipPanel({ slim = false, onMsgChange }: SlipPanelProps) {
  const slip = useBetSlip();
  const { user, update } = useCurrentUser();
  const bets = useBets(user?.id);
  const [stake, setStake] = useState('100');
  const [parlay, setParlay] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const patchMsg = useCallback(
    (next: { kind: 'ok' | 'err'; text: string } | null) => {
      setMsg(next);
      onMsgChange?.(next);
    },
    [onMsgChange],
  );

  // 登录态变化后清掉旧提示：此前未登录时点的「请先登录」红条在登录成功后仍挂着
  useEffect(() => {
    if (user) {
      setMsg((prev) => {
        if (prev && prev.text.includes('登录')) {
          onMsgChange?.(null);
          return null;
        }
        return prev;
      });
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!user) {
      patchMsg({ kind: 'err', text: '请先到「我的」页登录' });
      return;
    }
    if (slip.items.length === 0) {
      patchMsg({ kind: 'err', text: '下注单是空的' });
      return;
    }
    const amount = Number(stake);
    if (!amount || amount <= 0) {
      patchMsg({ kind: 'err', text: '请输入有效金额' });
      return;
    }
    if (parlay && slip.items.length < 2) {
      patchMsg({ kind: 'err', text: '串关至少需要 2 个选择' });
      return;
    }
    setSubmitting(true);
    patchMsg(null);
    try {
      let balanceAfter: number;
      if (parlay) {
        const result = await placeParlayItems(slip.items, amount);
        patchMsg({ kind: 'ok', text: `✅ 串关下注成功（${slip.items.length} 串），余额 ¥${result.balance}` });
        balanceAfter = result.balance;
      } else {
        const results = await placeBetItems(user.id, slip.items.map((i) => ({ ...i, stake: amount })));
        balanceAfter = results[results.length - 1].balance;
        patchMsg({ kind: 'ok', text: `✅ 下注成功 ${results.length} 单，余额 ¥${balanceAfter}` });
      }
      // 服务端扣款后的真实余额同步进全局登录态，「我的」页不再展示旧余额
      update({ ...user, balance: balanceAfter });
      slip.clear();
      setParlay(false);
      bets.refresh();
    } catch (e) {
      patchMsg({ kind: 'err', text: localizeBetError(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const combinedOdds = slip.items.reduce((s, i) => s * i.price, 1);
  const totalStake = Number(stake || 0) * (parlay ? 1 : slip.items.length);
  const projectedPayout = parlay ? totalStake * combinedOdds : slip.items.reduce((s, i) => s + Number(stake || 0) * i.price, 0);

  return (
    <View style={styles.wrap}>
      {msg && <FlashMsg msg={msg} />}

      {slip.items.length > 0 && (
        <FlatList
          removeClippedSubviews={false}
          data={slip.items}
          keyExtractor={(i) => `${i.marketId}-${i.selection}`}
          contentContainerStyle={[styles.listContent, slim && { padding: spacing.md }]}
          renderItem={({ item }) => (
            <Card style={styles.slipItem} glass>
              <View style={{ flex: 1 }}>
                <Text style={styles.slipLabel}>
                  {item.label} <Text style={styles.slipPrice}>@{item.price.toFixed(2)}</Text>
                </Text>
                {item.matchLabel ? (
                  <Text style={styles.slipMatch} numberOfLines={1}>
                    {item.matchLabel}
                  </Text>
                ) : null}
                <Text style={styles.slipMeta} numberOfLines={1}>
                  {[
                    item.league,
                    item.kickoff ? formatKickoffLocal(item.kickoff) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                aria-label={`移除 ${item.label}`}
                onPress={() => slip.remove(item.marketId, item.selection)}
                hitSlop={8}
              >
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </Card>
          )}
        />
      )}

      {slip.items.length > 0 && (
        <View style={styles.footer}>
          {slip.items.length >= 2 && (
            <Pressable
              accessibilityRole="button"
              aria-label={parlay ? '关闭串关模式' : '开启串关模式'}
              style={styles.parlayToggle}
              onPress={() => setParlay(!parlay)}
            >
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  listContent: { padding: spacing.lg, paddingBottom: 20 },
  slipItem: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  slipLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: font.bold },
  slipPrice: { color: colors.secondary, fontSize: fontSize.md, fontWeight: font.bold },
  slipMatch: { color: colors.text, fontSize: fontSize.sm, marginTop: 4 },
  slipMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
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
