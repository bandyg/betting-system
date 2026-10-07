// 建赛 & 市场面板（admin 专）
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api, type Match } from '@betting/core';
import { Card, Input, Select, SectionTitle, Button, toast, spacing } from '@betting/ui';

type MktType = '1x2' | 'ah' | 'ou';

export function MatchesAdminPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [home, setHome] = useState('Arsenal');
  const [away, setAway] = useState('Chelsea');
  const [kickoff, setKickoff] = useState('2026-08-20T15:00');
  const [sport, setSport] = useState('');
  const [league, setLeague] = useState('');
  const [mktMatch, setMktMatch] = useState<number | null>(null);
  const [mktType, setMktType] = useState<MktType>('1x2');
  const [mktLine, setMktLine] = useState('-1.5');
  const [oddsA, setOddsA] = useState('2.1');
  const [oddsB, setOddsB] = useState('3.4');
  const [oddsC, setOddsC] = useState('3.2');

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

  const createMatch = async () => {
    if (!home.trim() || !away.trim()) return toast.warn('主客队名必填');
    const d = new Date(kickoff);
    if (Number.isNaN(d.getTime())) return toast.warn('开赛时间无效（格式 2026-08-20T15:00）');
    try {
      const res = await api.createMatch(home.trim(), away.trim(), d.toISOString(), sport || undefined, league || undefined);
      toast.ok(`创建成功：#${res.match.id}`);
      await refresh();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const createMarket = async () => {
    if (mktMatch == null) return toast.warn('先选择赛事');
    let line: number | null = null;
    if (mktType !== '1x2') {
      line = Number(mktLine);
      if (!Number.isFinite(line) || line === 0) return toast.warn('line 必须是非 0 数字');
    }
    const a = Number(oddsA);
    const b = Number(oddsB);
    if (!(a > 1) || !(b > 1)) return toast.warn('赔率必须大于 1');
    let odds: Record<string, number>;
    if (mktType === '1x2') {
      const c = Number(oddsC);
      if (!(c > 1)) return toast.warn('赔率必须大于 1');
      odds = { home: a, draw: b, away: c };
    } else if (mktType === 'ah') {
      odds = { home: a, away: b };
    } else {
      odds = { over: a, under: b };
    }
    try {
      const res = await api.createMarket(mktMatch, mktType, line, odds);
      toast.ok(`市场创建成功：#${res.market.id}`);
      await refresh();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const scheduled = matches.filter((m) => m.status === 'scheduled');

  return (
    <Card testID="panel-matches-admin" style={{ padding: spacing.lg, gap: spacing.md }}>
      <SectionTitle>🏟️ 建赛 & 市场</SectionTitle>
      <SectionTitle>建赛事</SectionTitle>
      <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input testID="match-home" value={home} onChangeText={setHome} placeholder="主队" style={{ width: 110 }} />
        <Text>vs</Text>
        <Input testID="match-away" value={away} onChangeText={setAway} placeholder="客队" style={{ width: 110 }} />
        <Input testID="match-kickoff" value={kickoff} onChangeText={setKickoff} placeholder="开赛时间 2026-08-20T15:00" style={{ width: 170 }} />
        <Input testID="match-sport" value={sport} onChangeText={setSport} placeholder="sport(可选)" style={{ width: 110 }} />
        <Input testID="match-league" value={league} onChangeText={setLeague} placeholder="league(可选)" style={{ width: 110 }} />
        <Button title="建赛" variant="ghost" onPress={createMatch} style={{ paddingHorizontal: spacing.lg }} />
      </View>
      <SectionTitle>添加市场</SectionTitle>
      <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          testID="market-match-select"
          value={mktMatch}
          onChange={setMktMatch}
          placeholder="选择赛事"
          options={scheduled.map((m) => ({ value: m.id, label: `${m.home_team} vs ${m.away_team}` }))}
        />
        <Select
          testID="market-type-select"
          value={mktType}
          onChange={(v) => setMktType(v)}
          options={[
            { value: '1x2' as MktType, label: '胜平负' },
            { value: 'ah' as MktType, label: '让球' },
            { value: 'ou' as MktType, label: '大小' },
          ]}
        />
        {mktType !== '1x2' ? (
          <Input testID="market-line" value={mktLine} onChangeText={setMktLine} keyboardType="decimal-pad" placeholder="line (±0.25 步进)" style={{ width: 130 }} />
        ) : null}
        <Input testID="market-odds-a" value={oddsA} onChangeText={setOddsA} keyboardType="decimal-pad" placeholder="赔率 A" style={{ width: 90 }} />
        <Input testID="market-odds-b" value={oddsB} onChangeText={setOddsB} keyboardType="decimal-pad" placeholder="赔率 B" style={{ width: 90 }} />
        {mktType === '1x2' ? (
          <Input testID="market-odds-c" value={oddsC} onChangeText={setOddsC} keyboardType="decimal-pad" placeholder="赔率 C(平)" style={{ width: 100 }} />
        ) : null}
        <Button testID="market-add-btn" title="添加市场" variant="ghost" onPress={createMarket} style={{ paddingHorizontal: spacing.lg }} />
      </View>
      <Button title="↻ 刷新" variant="ghost" onPress={() => void refresh()} style={{ alignSelf: 'flex-start', paddingHorizontal: spacing.lg }} />
    </Card>
  );
}
