import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, useUsers, useCurrentUser, useBets, SEL_LABELS, MATCH_STATUS_LABELS } from '@betting/core';
import type { Bet } from '@betting/core';
import { Card, Screen, Button, colors, radius, fontSize, font, spacing, SectionTitle, EmptyState } from '@betting/ui';

function betLabel(b: Bet): string {
  return `${SEL_LABELS[b.selection] ?? b.selection} @${b.price.toFixed(2)}`;
}

function statusColor(status: string): string {
  if (status === 'won') return colors.success;
  if (status === 'lost') return colors.danger;
  if (status === 'void') return colors.warning;
  return colors.textSecondary;
}

export default function AccountScreen() {
  const users = useUsers();
  const { user, select, update, clear } = useCurrentUser();
  const bets = useBets(user?.id);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [depositAmt, setDepositAmt] = useState('1000');
  const [depositing, setDepositing] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const createUser = async () => {
    if (!newName.trim()) {
      setMsg({ kind: 'err', text: '请输入用户名' });
      return;
    }
    setCreating(true);
    setMsg(null);
    try {
      const res = await api.createUser(newName.trim());
      select(res.user);
      setNewName('');
      users.refresh();
      setMsg({ kind: 'ok', text: `✅ 用户 ${res.user.name} 已创建` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  };

  const deposit = async () => {
    if (!user) {
      setMsg({ kind: 'err', text: '先选择/创建用户' });
      return;
    }
    const amount = Number(depositAmt);
    if (!amount || amount <= 0) {
      setMsg({ kind: 'err', text: '请输入有效金额' });
      return;
    }
    setDepositing(true);
    setMsg(null);
    try {
      const res = await api.deposit(user.id, amount);
      setMsg({ kind: 'ok', text: `✅ 已充值 ¥${amount}，余额 ¥${res.account.balance}` });
      users.refresh();
      bets.refresh();
      // 刷新当前用户对象（余额等字段）
      update({ ...user, balance: res.account.balance });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setDepositing(false);
    }
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <SectionTitle>👤 我的</SectionTitle>

          {/* 当前用户 */}
          <Card style={styles.userCard} glass>
            {user ? (
              <View style={styles.userRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>#{user.id} {user.name}</Text>
                  <Text style={styles.balance}>余额 ¥{user.balance.toLocaleString()}</Text>
                </View>
                <Pressable onPress={clear} hitSlop={8}>
                  <Text style={styles.switch}>切换</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.noUser}>未选择用户 —— 选一个或新建</Text>
            )}
          </Card>

          {/* 创建用户 */}
          <Card style={styles.sectionCard}>
            <Text style={styles.cardTitle}>新建用户</Text>
            <View style={styles.row}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="用户名（如 demo）"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <Button title="创建" onPress={createUser} loading={creating} style={{ minWidth: 96 }} />
            </View>
          </Card>

          {/* 选择已有用户 */}
          <Card style={styles.sectionCard}>
            <Text style={styles.cardTitle}>选择用户</Text>
            {users.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
            <View style={styles.userList}>
              {(users.data?.users ?? []).map((u) => (
                <Pressable
                  key={u.id}
                  onPress={() => select(u)}
                  style={({ pressed }) => [
                    styles.userChip,
                    { backgroundColor: user?.id === u.id ? colors.oddsActiveBg : colors.oddsBg, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.userChipText, { color: user?.id === u.id ? colors.secondary : colors.text }]}>
                    #{u.id} {u.name} · ¥{u.balance}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          {/* 充值 */}
          {user && (
            <Card style={styles.sectionCard}>
              <Text style={styles.cardTitle}>充值</Text>
              <View style={styles.row}>
                <TextInput
                  value={depositAmt}
                  onChangeText={setDepositAmt}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <Button title="充值" onPress={deposit} loading={depositing} style={{ minWidth: 96 }} />
              </View>
            </Card>
          )}

          {msg && (
            <View style={[styles.msg, { backgroundColor: msg.kind === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }]}>
              <Text style={{ color: msg.kind === 'ok' ? colors.success : colors.danger }}>{msg.text}</Text>
            </View>
          )}

          {/* 投注记录 */}
          <SectionTitle style={styles.recordTitle}>📋 投注记录</SectionTitle>
          {bets.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
          {!bets.loading && (bets.data?.bets ?? []).length === 0 && <EmptyState text="暂无投注记录" />}
          {(bets.data?.bets ?? []).map((b) => (
            <Card key={b.id} style={styles.betRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.betMain}>
                  {betLabel(b)} · ¥{b.stake}
                </Text>
                <Text style={styles.betSub}>
                  #{b.id} · {b.created_at?.replace('T', ' ').slice(0, 16)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.betStatus, { color: statusColor(b.status) }]}>
                  {b.status.toUpperCase()}
                </Text>
                {b.status === 'won' && <Text style={styles.betPayout}>+¥{b.potential_payout}</Text>}
              </View>
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 120 },
  userCard: { marginBottom: spacing.lg },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  userName: { color: colors.text, fontSize: fontSize.xl, fontWeight: font.bold },
  balance: { color: colors.success, fontSize: fontSize.lg, fontWeight: font.bold, marginTop: 4 },
  switch: { color: colors.secondary, fontSize: fontSize.md, fontWeight: font.bold },
  noUser: { color: colors.textSecondary, fontSize: fontSize.md },
  sectionCard: { marginBottom: spacing.lg },
  cardTitle: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: font.regular, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: fontSize.md,
  },
  userList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  userChip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  userChipText: { fontSize: fontSize.sm, fontWeight: font.regular },
  msg: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  recordTitle: { marginTop: spacing.sm },
  betRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  betMain: { color: colors.text, fontSize: fontSize.md, fontWeight: font.bold },
  betSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  betStatus: { fontSize: fontSize.sm, fontWeight: font.bold },
  betPayout: { color: colors.success, fontSize: fontSize.sm, marginTop: 2 },
});
