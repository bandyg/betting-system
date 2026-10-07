// 投注单：单注/串关双模式、逐注或统一本金、串关组合赔率预览、确认弹窗（8s 自动确认）、admin 代理下注、赔率变化闪动
// 修复旧版：串关模式改用 placeParlay 生成真正串关注单（旧 web 版为循环单注）
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api, useAuth, placeParlayItems, SEL_LABELS, TYPE_LABELS, type Bet, type User } from '@betting/core';
import { Card, Input, Select, Button, ConfirmModal, toast, useTheme, fontSize, radius, spacing } from '@betting/ui';
import { useKeyboardRegistry } from '../keyboard';
import type { BasketPick } from './MatchesExplorer';

type Mode = 'single' | 'parlay';

interface ConfirmItem {
  marketId: number;
  matchLabel: string;
  marketLabel: string;
  selection: string;
  price: number;
  stake: number;
}

export function BetSlip({ items, onRemove, onClear }: { items: BasketPick[]; onRemove: (key: string) => void; onClear: () => void }) {
  const t = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const keyboard = useKeyboardRegistry();

  const [stake, setStake] = useState('100');
  const [perStakes, setPerStakes] = useState<Record<string, string>>({});
  const [proxyUid, setProxyUid] = useState<number | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [mode, setMode] = useState<Mode>('single');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [oddsFlash, setOddsFlash] = useState<Record<string, 'up' | 'down' | null>>({});
  const prevPricesRef = useRef<Record<string, number>>({});

  // 赔率变化闪动
  useEffect(() => {
    const prev = prevPricesRef.current;
    const flashes: Record<string, 'up' | 'down'> = {};
    for (const it of items) {
      const oldP = prev[it.key];
      if (oldP != null && oldP !== it.price) flashes[it.key] = it.price > oldP ? 'up' : 'down';
    }
    if (Object.keys(flashes).length > 0) {
      setOddsFlash((m) => ({ ...m, ...flashes }));
      setTimeout(() => {
        setOddsFlash((m) => {
          const next = { ...m };
          for (const k of Object.keys(flashes)) next[k] = null;
          return next;
        });
      }, 1200);
    }
    const newPrev: Record<string, number> = {};
    for (const it of items) newPrev[it.key] = it.price;
    prevPricesRef.current = newPrev;
  }, [items]);

  useEffect(() => {
    if (isAdmin) void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
  }, [isAdmin]);

  const combinedPrice = useMemo(() => (items.length === 0 ? 0 : items.reduce((acc, it) => acc * it.price, 1)), [items]);
  const totalStake = useMemo(() => {
    if (items.length === 0) return 0;
    if (mode === 'single') return items.reduce((n, it) => n + (Number(perStakes[it.key]) || 0), 0);
    return Number(stake) || 0;
  }, [items, mode, stake, perStakes]);
  const totalPotential = useMemo(() => {
    if (items.length === 0) return 0;
    if (mode === 'single') return items.reduce((n, it) => n + (Number(perStakes[it.key]) || 0) * it.price, 0);
    return (Number(stake) || 0) * combinedPrice;
  }, [items, mode, stake, perStakes, combinedPrice]);

  const buildConfirmItems = (): ConfirmItem[] | null => {
    if (items.length === 0) {
      toast.warn('投注单为空，请先在大厅点击赔率选择');
      return null;
    }
    if (!user && !isAdmin) {
      toast.warn('请先登录再下注');
      return null;
    }
    if (isAdmin && proxyUid == null) {
      toast.warn('代客下注请先选择用户');
      return null;
    }
    return items.map((it) => ({
      marketId: it.marketId,
      matchLabel: it.matchLabel,
      marketLabel: it.marketLabel,
      selection: it.selection,
      price: it.price,
      stake: mode === 'parlay' ? Number(stake) || 0 : Number(perStakes[it.key] ?? stake) || 0,
    }));
  };

  const submit = () => {
    const ci = buildConfirmItems();
    if (!ci) return;
    if (ci.some((it) => !(it.stake > 0))) {
      toast.warn('所有注的投注额必须大于 0');
      return;
    }
    setConfirmOpen(true);
  };

  // 快捷键 Enter → 提交
  useEffect(() => keyboard.registerSubmit(submit), [keyboard, submit]);

  const doPlaceBets = async () => {
    setConfirmOpen(false);
    const uid = isAdmin ? Number(proxyUid) : user!.id;
    try {
      if (mode === 'parlay') {
        // 真串关：整单一次提交，赔率相乘
        const stakeNum = Number(stake) || 0;
        const res = await placeParlayItems(
          items.map((it) => ({ marketId: it.marketId, selection: it.selection, price: it.price, label: `${it.matchLabel} ${SEL_LABELS[it.selection] ?? it.selection}`, stake: stakeNum })),
          stakeNum,
        );
        toast.ok(`串关下注成功：#${res.bet.id}（组合赔率 ${combinedPrice.toFixed(2)}，潜在派彩 ¥${res.bet.potential_payout}）`);
        onClear();
        setPerStakes({});
      } else {
        let okCount = 0;
        let lastBet: Bet | null = null;
        for (const it of items) {
          const s = Number(perStakes[it.key] ?? stake);
          try {
            const res = await api.placeBet(uid, it.marketId, it.selection, s);
            okCount += 1;
            lastBet = res.bet;
          } catch (e) {
            toast.err(`#${it.marketId} ${SEL_LABELS[it.selection] ?? it.selection} 下注失败：${e instanceof Error ? e.message : String(e)}`);
            break;
          }
        }
        if (okCount > 0) {
          toast.ok(`下注成功：${okCount} 笔${lastBet ? `（#${lastBet.id}，潜在派彩 ¥${lastBet.potential_payout}）` : ''}`);
          onClear();
          setPerStakes({});
        }
      }
      if (isAdmin) void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const flashColor = (key: string) => {
    const f = oddsFlash[key];
    return f === 'up' ? t.success : f === 'down' ? t.danger : t.text;
  };

  return (
    <Card testID="bet-slip" style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: t.text, fontSize: fontSize.lg, fontWeight: '900' }}>🧾 投注单 {items.length > 0 ? `(${items.length})` : ''}</Text>
        {items.length > 1 ? (
          <View style={{ flexDirection: 'row', borderRadius: radius.pill, overflow: 'hidden', borderColor: t.border, borderWidth: 1 }}>
            {(['single', 'parlay'] as Mode[]).map((m) => (
              <Pressable
                key={m}
                testID={`mode-${m}`}
                onPress={() => setMode(m)}
                style={{ paddingHorizontal: 14, paddingVertical: 5, backgroundColor: mode === m ? t.secondary : 'transparent' }}
              >
                <Text style={{ color: mode === m ? '#fff' : t.textSecondary, fontSize: fontSize.sm, fontWeight: '700' }}>{m === 'single' ? '单注' : '🔗 组合'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {items.length === 0 ? (
        <Text style={{ color: t.textMuted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: spacing.xl }}>
          点击大厅赔率加入投注单
        </Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {items.map((it) => {
            const isCollapsed = collapsed[it.key];
            return (
              <View key={it.key} testID={`slip-item-${it.key}`} style={{ backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Pressable testID={`slip-toggle-${it.key}`} onPress={() => setCollapsed((c) => ({ ...c, [it.key]: !c[it.key] }))} hitSlop={6}>
                    <Text style={{ color: t.textMuted }}>{isCollapsed ? '▶' : '▼'}</Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={isCollapsed ? 1 : undefined} style={{ color: t.text, fontSize: fontSize.sm, fontWeight: '700' }}>
                      {it.matchLabel}
                    </Text>
                    {!isCollapsed ? (
                      <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>
                        {TYPE_LABELS[it.marketLabel] ?? it.marketLabel} · {SEL_LABELS[it.selection] ?? it.selection}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ color: flashColor(it.key), fontWeight: '900', fontSize: fontSize.md }}>{it.price.toFixed(2)}</Text>
                  <Pressable testID={`slip-remove-${it.key}`} onPress={() => onRemove(it.key)} hitSlop={6}>
                    <Text style={{ color: t.textMuted }}>✕</Text>
                  </Pressable>
                </View>
                {!isCollapsed && mode === 'single' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 8 }}>
                    <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>本金</Text>
                    <Input
                      testID={`slip-stake-${it.key}`}
                      value={perStakes[it.key] ?? stake}
                      onChangeText={(v) => setPerStakes((ps) => ({ ...ps, [it.key]: v }))}
                      keyboardType="decimal-pad"
                      style={{ width: 90 }}
                    />
                    <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>
                      可赢 ¥{(((Number(perStakes[it.key] ?? stake) || 0) * it.price)).toFixed(2)}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {mode === 'parlay' && items.length > 1 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.oddsBg, borderRadius: radius.md, padding: spacing.md }}>
          <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>组合赔率</Text>
          <Text style={{ color: t.secondary, fontSize: fontSize.lg, fontWeight: '900' }}>{combinedPrice.toFixed(2)}</Text>
          <Input testID="parlay-stake" value={stake} onChangeText={setStake} keyboardType="decimal-pad" style={{ width: 100, marginLeft: 'auto' }} />
          <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>可赢 ¥{totalPotential.toFixed(2)}</Text>
        </View>
      ) : null}
      {mode === 'single' && items.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>默认本金</Text>
          <Input testID="default-stake" value={stake} onChangeText={setStake} keyboardType="decimal-pad" style={{ width: 100 }} />
        </View>
      ) : null}

      {isAdmin ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={{ color: t.warning, fontSize: fontSize.sm }}>👤 代客下注</Text>
          <Select
            testID="proxy-user-select"
            value={proxyUid}
            onChange={setProxyUid}
            placeholder="选择用户"
            options={users.map((u) => ({ value: u.id, label: `#${u.id} ${u.name}(¥${u.balance})` }))}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>
          总投 ¥{totalStake} · 潜在派彩 ¥{totalPotential.toFixed(2)}
        </Text>
        <Button testID="submit-bet" title="提交下注" onPress={submit} disabled={items.length === 0} style={{ paddingHorizontal: spacing.xl }} />
      </View>

      <ConfirmModal
        visible={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void doPlaceBets()}
        title={mode === 'parlay' ? '确认串关下注' : '确认下注'}
        confirmLabel="确认下注"
        autoConfirmMs={8000}
        testID="confirm-bet"
      >
        <View style={{ gap: 6 }}>
          {(mode === 'parlay'
            ? [{ ...items[0], stake: Number(stake) || 0 }]
            : items.map((it) => ({ ...it, stake: Number(perStakes[it.key] ?? stake) || 0 }))
          ).map((it, i) => (
            <View key={i} testID={`confirm-item-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
              <Text numberOfLines={1} style={{ color: t.textSecondary, fontSize: fontSize.sm, flex: 1 }}>
                {mode === 'parlay' ? `${items.length} 串 1（组合赔率 ${combinedPrice.toFixed(2)}）` : `${it.matchLabel} · ${SEL_LABELS[it.selection] ?? it.selection}`}
              </Text>
              <Text style={{ color: t.text, fontSize: fontSize.sm, fontWeight: '700' }}>
                ¥{it.stake} @ {it.price.toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>总投 ¥{totalStake}</Text>
            <Text style={{ color: t.secondary, fontWeight: '800' }}>可赢 ¥{totalPotential.toFixed(2)}</Text>
          </View>
        </View>
      </ConfirmModal>
    </Card>
  );
}
