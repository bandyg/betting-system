// 结算面板（admin 专）：选已完赛赛事 + 比分 → 录赛果并结算
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api, type Match } from '@betting/core';
import { Card, Input, Select, SectionTitle, Button, toast, spacing } from '@betting/ui';

export function SettlePanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [homeScore, setHomeScore] = useState('1');
  const [awayScore, setAwayScore] = useState('0');

  const refresh = useCallback(async () => {
    try {
      const res = await api.listMatches();
      setMatches(res.matches);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recordAndSettle = async () => {
    if (matchId == null) return toast.warn('请选择赛事');
    const hs = Number(homeScore);
    const as = Number(awayScore);
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) {
      return toast.warn('比分必须是非负整数');
    }
    try {
      await api.recordResult(matchId, hs, as);
      const res = await api.settleMatch(matchId);
      toast.ok(`结算完成：总派彩 ¥${res.totalPayout}，总退款 ¥${res.totalRefund}（${res.summary.length} 个市场）`);
      await refresh();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card testID="panel-settle" style={{ padding: spacing.lg, gap: spacing.md }}>
      <SectionTitle>💰 结算</SectionTitle>
      <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          testID="settle-match-select"
          value={matchId}
          onChange={setMatchId}
          placeholder="选择赛事（已完赛）"
          options={matches
            .filter((m) => m.status === 'finished')
            .map((m) => ({ value: m.id, label: `#${m.id} ${m.home_team} vs ${m.away_team}` }))}
        />
        <Input testID="settle-home-score" value={homeScore} onChangeText={setHomeScore} keyboardType="numeric" style={{ width: 80 }} placeholder="主队" />
        <Text>:</Text>
        <Input testID="settle-away-score" value={awayScore} onChangeText={setAwayScore} keyboardType="numeric" style={{ width: 80 }} placeholder="客队" />
        <Button testID="settle-btn" title="记录比分并结算" onPress={recordAndSettle} style={{ paddingHorizontal: spacing.lg }} />
      </View>
      <Button title="↻ 刷新" variant="ghost" onPress={() => void refresh()} style={{ alignSelf: 'flex-start', paddingHorizontal: spacing.lg }} />
    </Card>
  );
}
