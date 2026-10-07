// 赛事详情弹窗：元信息 + 市场页签 + 赔率行（隐含概率 + mock 走势图 + 加注）
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TYPE_LABELS, SEL_LABELS, MATCH_STATUS_LABELS, type Match, type Market, type OddsItem } from '@betting/core';
import { Modal, Badge, MiniChart, Button, useTheme, fontSize, radius, spacing } from '@betting/ui';
import { fmtFull } from './lib';

// mock odds history（与旧版一致：随机游走，终点=当前价）
function mockOddsHistory(basePrice: number, n = 24): number[] {
  const out: number[] = [];
  let p = basePrice * 0.97;
  for (let i = 0; i < n; i++) {
    p = p + (Math.random() - 0.48) * 0.04;
    p = Math.max(1.01, p);
    out.push(parseFloat(p.toFixed(2)));
  }
  out[out.length - 1] = basePrice;
  return out;
}

function impliedProb(price: number): string {
  if (price <= 1) return '—';
  return ((1 / price) * 100).toFixed(1) + '%';
}

export function MatchDetail({
  match,
  onClose,
  onPick,
  loggedIn,
}: {
  match: Match | null;
  onClose: () => void;
  onPick: (m: Match, mk: Market, o: OddsItem) => void;
  loggedIn: boolean;
}) {
  const t = useTheme();
  const [activeMarket, setActiveMarket] = useState<number | null>(null);

  if (!match) return null;

  const defaultMarket = match.markets.find((m) => m.status === 'open') ?? match.markets[0];
  const marketId = activeMarket ?? defaultMarket?.id ?? null;
  const market = match.markets.find((m) => m.id === marketId) ?? null;

  return (
    <Modal visible testID="match-detail" onClose={onClose} title={`${match.home_team} vs ${match.away_team}`} width={560}>
      <View style={{ gap: spacing.md }}>
        {/* meta */}
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge status={match.status} label={MATCH_STATUS_LABELS[match.status] ?? match.status} />
          <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>🏆 {match.sport ?? '—'}</Text>
          {match.league ? <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>📋 {match.league}</Text> : null}
          <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>🕐 {fmtFull(match.kickoff_time)}</Text>
          {match.home_score != null ? (
            <Text style={{ color: t.success, fontWeight: '800' }}>
              比分 {match.home_score} : {match.away_score}
            </Text>
          ) : null}
        </View>

        {match.markets.length === 0 ? (
          <Text style={{ color: t.textMuted, textAlign: 'center', paddingVertical: spacing.xl }}>该赛事暂无市场</Text>
        ) : (
          <>
            {/* market tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {match.markets.map((mk) => {
                const active = marketId === mk.id;
                const open = mk.status === 'open';
                return (
                  <Pressable
                    key={mk.id}
                    testID={`md-market-${mk.id}`}
                    disabled={!open}
                    onPress={() => setActiveMarket(mk.id)}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 6,
                      borderRadius: radius.pill,
                      backgroundColor: active ? t.oddsActiveBg : t.bg,
                      borderColor: active ? t.oddsActiveBorder : t.border,
                      borderWidth: 1,
                      opacity: open ? 1 : 0.5,
                    }}
                  >
                    <Text style={{ color: active ? t.secondary : t.textSecondary, fontSize: fontSize.sm, fontWeight: '700' }}>
                      {TYPE_LABELS[mk.type] ?? mk.type}
                      {mk.line != null ? ` @ ${mk.line}` : ''}
                      {open ? '' : '（已关闭）'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* odds rows */}
            {market ? (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', paddingHorizontal: spacing.sm }}>
                  <Text style={{ color: t.textMuted, fontSize: fontSize.xs, flex: 1.4 }}>选项</Text>
                  <Text style={{ color: t.textMuted, fontSize: fontSize.xs, flex: 0.7 }}>赔率</Text>
                  <Text style={{ color: t.textMuted, fontSize: fontSize.xs, flex: 0.9 }}>隐含概率</Text>
                  <Text style={{ color: t.textMuted, fontSize: fontSize.xs, flex: 1, textAlign: 'right' }}>操作</Text>
                </View>
                {market.odds.map((o) => (
                  <View key={`${market.id}-${o.selection}`} testID={`md-odds-${o.selection}`} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8 }}>
                    <View style={{ flex: 1.4 }}>
                      <Text style={{ color: t.text, fontSize: fontSize.sm, fontWeight: '700' }}>{SEL_LABELS[o.selection] ?? o.selection}</Text>
                      <MiniChart data={mockOddsHistory(o.price)} width={130} height={30} testID={`md-chart-${o.selection}`} />
                    </View>
                    <Text style={{ flex: 0.7, color: t.text, fontWeight: '800', fontSize: fontSize.md }}>{o.price.toFixed(2)}</Text>
                    <Text style={{ flex: 0.9, color: t.textMuted, fontSize: fontSize.sm }}>{impliedProb(o.price)}</Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Button
                        testID={`md-pick-${o.selection}`}
                        title={!loggedIn ? '🔒 登录' : market.status !== 'open' ? '已关闭' : '＋ 加注'}
                        variant="ghost"
                        disabled={market.status !== 'open' || !loggedIn}
                        onPress={() => onPick(match, market, o)}
                        style={{ paddingHorizontal: 12, height: 34 }}
                      />
                    </View>
                  </View>
                ))}
                <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>提示: 加注后, 在「投注单」可统一提交</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </Modal>
  );
}
