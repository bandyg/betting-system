import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, useAuth, useBets, usePreferences, useUsers, SEL_LABELS } from '@betting/core';
import type { Bet, User } from '@betting/core';
import { Card, Screen, Button, FlashMsg, colors, radius, fontSize, font, spacing, SectionTitle, EmptyState } from '@betting/ui';

function betLabel(b: Bet): string {
  return `${SEL_LABELS[b.selection] ?? b.selection} @${b.price.toFixed(2)}`;
}

function statusColor(status: string): string {
  if (status === 'won') return colors.success;
  if (status === 'lost') return colors.danger;
  if (status === 'void') return colors.warning;
  return colors.textSecondary;
}

/** 登录 / 注册表单 */
function AuthForm() {
  const auth = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async () => {
    if (!name.trim() || !password) {
      setMsg({ kind: 'err', text: '请输入用户名和密码' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const user =
        mode === 'login'
          ? await auth.login(name.trim(), password)
          : await auth.register(name.trim(), password);
      setMsg({ kind: 'ok', text: `✅ 欢迎，${user.name}` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card style={styles.authCard} glass>
        <Text style={styles.authTitle}>{mode === 'login' ? '🔐 登录' : '✨ 注册新账号'}</Text>
        <Text style={styles.authSub}>
          {mode === 'login' ? '登录后查看余额、下注记录与偏好' : '注册即送 ¥0 余额，先充后玩'}
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="用户名"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="密码"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          style={[styles.input, { marginTop: spacing.md }]}
        />

        {msg && <FlashMsg msg={msg} />}

        <Button
          title={busy ? (mode === 'login' ? '登录中…' : '注册中…') : mode === 'login' ? '登 录' : '注 册'}
          onPress={submit}
          loading={busy}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')} hitSlop={8}>
        <Text style={styles.switchText}>
          {mode === 'login' ? '没有账号？注册一个' : '已有账号？去登录'}
        </Text>
      </Pressable>
    </>
  );
}

/** 管理员面板：新建用户 / 用户列表 / 给任意用户充值（仅 role=admin 可见） */
function AdminPanel() {
  const users = useUsers();
  const [newName, setNewName] = useState('');
  const [newPw, setNewPw] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
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
      const res = await api.createUser(newName.trim(), newPw || undefined);
      setNewName('');
      setNewPw('');
      users.refresh();
      setMsg({ kind: 'ok', text: `✅ 用户 ${res.user.name} 已创建` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  };

  const deposit = async () => {
    if (!selected) {
      setMsg({ kind: 'err', text: '先从列表选择要充值的用户' });
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
      const res = await api.deposit(selected.id, amount);
      setMsg({ kind: 'ok', text: `✅ 已给 ${selected.name} 充值 ¥${amount}，余额 ¥${res.account.balance}` });
      users.refresh();
      setSelected((prev) => (prev ? { ...prev, balance: res.account.balance } : prev));
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setDepositing(false);
    }
  };

  return (
    <>
      <SectionTitle style={styles.recordTitle}>🛠 管理</SectionTitle>

      {/* 新建用户 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>新建用户</Text>
        <View style={styles.row}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="用户名"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.input}
          />
        </View>
        <TextInput
          value={newPw}
          onChangeText={setNewPw}
          placeholder="密码（默认 123456）"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          style={[styles.input, { marginTop: spacing.sm }]}
        />
        <Button title="创建" onPress={createUser} loading={creating} style={{ marginTop: spacing.sm }} />
      </Card>

      {/* 用户列表（点击选中） */}
      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>用户列表 · 点击选择</Text>
        {users.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
        <View style={styles.userList}>
          {(users.data?.users ?? []).map((u) => (
            <Pressable
              key={u.id}
              onPress={() => setSelected(u)}
              style={({ pressed }) => [
                styles.userChip,
                {
                  backgroundColor: selected?.id === u.id ? colors.oddsActiveBg : colors.oddsBg,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={[styles.userChipText, { color: selected?.id === u.id ? colors.secondary : colors.text }]}>
                #{u.id} {u.name}{u.role === 'admin' ? ' 👑' : ''} · ¥{u.balance}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {/* 给选中用户充值 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>
          充值 {selected ? `→ ${selected.name}（¥${selected.balance}）` : '（先选用户）'}
        </Text>
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

      {msg && <FlashMsg msg={msg} />}
    </>
  );
}

export default function AccountScreen() {
  const auth = useAuth();
  const { user } = auth;
  const bets = useBets(user?.id);
  const [depositAmt, setDepositAmt] = useState('1000');
  const [depositing, setDepositing] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const prefs = usePreferences(user?.id);
  const [favTeam, setFavTeam] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const deposit = async () => {
    if (!user) return;
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
      bets.refresh();
      // 刷新当前用户对象（余额等字段）
      auth.update({ ...user, balance: res.account.balance });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setDepositing(false);
    }
  };

  const savePreferences = async () => {
    if (!user) return;
    setSavingPrefs(true);
    setMsg(null);
    try {
      const res = await api.updatePreferences(user.id, {
        favorite_team: favTeam.trim() || null,
        marketing_opt_in: optIn,
      });
      setFavTeam(res.preferences.favorite_team ?? '');
      setOptIn(res.preferences.marketing_opt_in);
      setMsg({ kind: 'ok', text: '✅ 偏好已保存' });
      prefs.refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingPrefs(false);
    }
  };

  // ── 未登录：登录页 ──
  if (!user) {
    return (
      <Screen>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <Text style={styles.brandTitle}>⚡ BET NOW</Text>
              <Text style={styles.brandSub}>登录你的投注账户</Text>
            </View>
            <AuthForm />
          </ScrollView>
        </SafeAreaView>
      </Screen>
    );
  }

  // ── 已登录：用户信息页 ──
  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <SectionTitle>👤 我的</SectionTitle>

          {/* 当前用户 */}
          <Card style={styles.userCard} glass>
            <View style={styles.userRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>#{user.id} {user.name}</Text>
                <Text style={styles.balance}>余额 ¥{user.balance.toLocaleString()}</Text>
              </View>
              <Pressable onPress={auth.logout} hitSlop={8} style={styles.logoutBtn}>
                <Text style={styles.logoutText}>退出登录</Text>
              </Pressable>
            </View>
          </Card>

          {/* 管理面板（仅 admin） */}
          {user.role === 'admin' && <AdminPanel />}

          {/* 充值 */}
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

          {msg && <FlashMsg msg={msg} />}

          {/* 客户偏好 (CRM) */}
          <Card style={styles.sectionCard}>
            <Text style={styles.cardTitle}>❤️ 偏好设置（CRM）</Text>
            <TextInput
              value={favTeam}
              onChangeText={setFavTeam}
              placeholder={prefs.data?.preferences.favorite_team ?? '喜欢的球队（如 Arsenal）'}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Pressable onPress={() => setOptIn(!optIn)} style={styles.optRow}>
              <View style={[styles.checkbox, { backgroundColor: optIn ? colors.secondary : 'transparent' }]}>
                {optIn && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.md, marginLeft: spacing.sm }}>
                接收营销推送
              </Text>
            </Pressable>
            <Button title={savingPrefs ? '保存中…' : '保存偏好'} onPress={savePreferences} loading={savingPrefs} />
          </Card>

          {/* 投注记录 */}
          <SectionTitle style={styles.recordTitle}>📋 投注记录</SectionTitle>
          {bets.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
          {!bets.loading && (bets.data?.bets ?? []).length === 0 && <EmptyState text="暂无投注记录，去赛事页下第一注" />}
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
  // 登录页
  brand: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl },
  brandTitle: { color: colors.text, fontSize: 28, fontWeight: font.bold, letterSpacing: 1 },
  brandSub: { color: colors.textSecondary, fontSize: fontSize.md, marginTop: spacing.sm },
  authCard: { paddingVertical: spacing.lg },
  authTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: font.bold },
  authSub: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4, marginBottom: spacing.lg },
  switchText: { color: colors.secondary, fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.lg, fontWeight: font.bold },
  // 已登录
  userCard: { marginBottom: spacing.lg },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  userName: { color: colors.text, fontSize: fontSize.xl, fontWeight: font.bold },
  balance: { color: colors.success, fontSize: fontSize.lg, fontWeight: font.bold, marginTop: 4 },
  logoutBtn: { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  logoutText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: font.bold },
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
  recordTitle: { marginTop: spacing.sm },
  userList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  userChip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  userChipText: { fontSize: fontSize.sm, fontWeight: font.regular },
  betRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  betMain: { color: colors.text, fontSize: fontSize.md, fontWeight: font.bold },
  betSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  betStatus: { fontSize: fontSize.sm, fontWeight: font.bold },
  betPayout: { color: colors.success, fontSize: fontSize.sm, marginTop: 2 },
  optRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
});
