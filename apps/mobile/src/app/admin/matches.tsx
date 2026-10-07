// 大厅页：≥1100px 双栏（Explorer + 右侧 sticky 投注单），窄屏单栏
import React, { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { MatchesExplorer, type BasketPick } from '@/admin/panels/MatchesExplorer';
import { BetSlip } from '@/admin/panels/BetSlip';
import { size } from '@betting/ui';

export default function AdminMatches() {
  const dims = useWindowDimensions();
  const [basket, setBasket] = useState<BasketPick[]>([]);
  const wide = dims.width >= 1100;

  const pickedKeys = new Set(basket.map((b) => b.key));

  const onPick = (p: BasketPick) => {
    setBasket((cur) => {
      const i = cur.findIndex((b) => b.key === p.key);
      // 再点同一条 → 移除（与旧版 odds-chip selected toggle 一致）
      if (i >= 0) return cur.filter((b) => b.key !== p.key);
      // 同市场互斥选择（1 个市场只留 1 个 selection）
      const dedup = cur.filter((b) => b.marketId !== p.marketId);
      return [...dedup, p];
    });
  };

  const explorer = <MatchesExplorer onPick={onPick} pickedKeys={pickedKeys} />;
  const slip = (
    <BetSlip
      items={basket}
      onRemove={(key) => setBasket((cur) => cur.filter((b) => b.key !== key))}
      onClear={() => setBasket([])}
    />
  );

  if (wide) {
    return (
      <View testID="admin-lobby" style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, paddingHorizontal: 16 }}>{explorer}</View>
        <View style={{ width: size.betSlipW, borderLeftWidth: 1, borderLeftColor: 'rgba(124,58,237,0.15)' }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>{slip}</ScrollView>
        </View>
      </View>
    );
  }
  return (
    <ScrollView testID="admin-lobby" contentContainerStyle={{ padding: 16, gap: 16 }}>
      {explorer}
      {slip}
    </ScrollView>
  );
}
