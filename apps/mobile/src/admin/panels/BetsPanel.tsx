// 投注记录面板：9 列表格 + admin 用户筛选 + 新结算闪动 + 输赢着色
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { api, useAuth, type Bet, type User, SEL_LABELS } from '@betting/core';
import { Card, DataTable, Select, SectionTitle, Button, Badge, toast, useTheme, fontSize, spacing } from '@betting/ui';
import { fmtTime } from '../lib';

function betOutcome(b: Bet): 'win' | 'lose' | 'pending' | 'open' {
  if (b.status === 'open' || b.status === 'cancelled') return 'open';
  if (b.status === 'settled') return 'win';
  if (b.status === 'lost') return 'lose';
  return 'pending';
}

export function BetsPanel() {
  const t = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const loggedIn = !!user;

  const [bets, setBets] = useState<Bet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const prevBetsRef = useRef<Map<number, string>>(new Map());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listBets(userId == null ? undefined : userId);
      const prev = prevBetsRef.current;
      const newFlash = new Set<number>();
      for (const b of res.bets) {
        const oldSt = prev.get(b.id);
        if (oldSt && oldSt !== b.status && (b.status === 'settled' || b.status === 'lost')) newFlash.add(b.id);
        prev.set(b.id, b.status);
      }
      if (newFlash.size > 0) {
        setFlashIds((cur) => new Set([...cur, ...newFlash]));
        setTimeout(() => {
          setFlashIds((cur) => {
            const next = new Set(cur);
            newFlash.forEach((id) => next.delete(id));
            return next;
          });
        }, 3000);
      }
      setBets(res.bets);
      setAuthHint(null);
    } catch (e) {
      const st = (e as { status?: number }).status;
      if (st === 401) {
        setBets([]);
        setAuthHint('登录状态已失效，请重新登录');
      } else {
        toast.err(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAdmin) void api.listUsers().then((r) => setUsers(r.users)).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (loggedIn) {
      setAuthHint(null);
      void refresh();
    } else {
      setBets([]);
      setAuthHint('请先登录后查看投注记录');
    }
  }, [loggedIn, refresh]);

  const outcomeColor = (b: Bet) => {
    const o = betOutcome(b);
    if (o === 'win') return t.success;
    if (o === 'lose') return t.danger;
    return t.textSecondary;
  };

  return (
    <Card testID="panel-bets" style={{ padding: spacing.lg, gap: spacing.md }}>
      <SectionTitle>📋 投注记录</SectionTitle>
      {isAdmin ? (
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <Select
            testID="bets-user-select"
            value={userId}
            onChange={setUserId}
            placeholder="全部用户"
            options={users.map((u) => ({ value: u.id, label: `#${u.id} ${u.name}` }))}
          />
          <Button title="↻ 刷新" variant="ghost" onPress={() => void refresh()} style={{ paddingHorizontal: spacing.lg }} />
        </View>
      ) : null}
      {authHint ? (
        <Text testID="bets-auth-hint" style={{ color: t.warning, fontSize: fontSize.sm }}>
          ⚠ {authHint}
        </Text>
      ) : (
        <DataTable<Bet>
          testID="bets-table"
          loading={loading}
          emptyText="暂无投注记录"
          rows={bets}
          keyExtractor={(b) => String(b.id)}
          columns={[
            { key: 'id', label: '#', flex: 0.5 },
            { key: 'user_id', label: '用户', flex: 0.7, render: (b) => <Text style={{ color: t.textSecondary }}>#{b.user_id}</Text> },
            { key: 'market_id', label: '市场', flex: 0.7, render: (b) => <Text style={{ color: t.textSecondary }}>#{b.market_id}</Text> },
            { key: 'selection', label: '选择', flex: 1, render: (b) => <Text style={{ color: t.text }}>{b.selection ? (SEL_LABELS[b.selection] ?? b.selection) : '—'}</Text> },
            { key: 'stake', label: '金额', flex: 0.8, align: 'right', render: (b) => <Text>{b.stake}</Text> },
            { key: 'price', label: '赔率', flex: 0.7, align: 'right', render: (b) => <Text>{b.price}</Text> },
            {
              key: 'potential_payout',
              label: '派彩',
              flex: 1,
              align: 'right',
              render: (b) => (
                <Text style={{ color: outcomeColor(b), fontWeight: '700' }}>
                  {b.potential_payout}
                  {betOutcome(b) === 'win' ? ' 🎉' : betOutcome(b) === 'lose' ? ' 💔' : ''}
                  {flashIds.has(b.id) ? ' ✨' : ''}
                </Text>
              ),
            },
            { key: 'status', label: '状态', flex: 1, render: (b) => <Badge status={b.status} /> },
            { key: 'created_at', label: '时间', flex: 1.4, render: (b) => <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>{fmtTime(b.created_at)}</Text> },
          ]}
        />
      )}
    </Card>
  );
}
