import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, useAuth, useBets, usePreferences, useUsers, useMatches, useRiskLimits, useAnalyticsDashboard, useAnalyticsTrends, useAnalyticsHotMatches, useAnalyticsUsers, SEL_LABELS, RISK_FIELDS, RISK_FIELD_LABELS, MARKET_STATUS_LABELS, TYPE_LABELS, PAYMENT_STATUS_LABELS } from '@betting/core';
import type { Bet, User, Market, RiskField, PaymentOrder, DashboardStats, TrendPoint, HotMatch, UserAnalytics } from '@betting/core';
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

/** 交易工具面板：风控限额配置 + 调赔 + 挂盘/开盘（仅 role=admin 可见，Step 25） */
function TradingTools() {
  const matches = useMatches();
  const limits = useRiskLimits();
  const [limitInputs, setLimitInputs] = useState<Record<string, string>>({});
  const [savingLimits, setSavingLimits] = useState(false);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [marketId, setMarketId] = useState<number | null>(null);
  const [oddsInputs, setOddsInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const match = (matches.data?.matches ?? []).find((m) => m.id === matchId) ?? null;
  const market = match?.markets.find((m) => m.id === marketId) ?? null;

  // 限额表单默认值（数据加载后填充一次）
  if (limits.data && Object.keys(limitInputs).length === 0) {
    const next: Record<string, string> = {};
    for (const f of RISK_FIELDS) next[f] = String(limits.data.limits[f]);
    setLimitInputs(next);
  }

  const saveLimits = async () => {
    const payload: Partial<Record<RiskField, number>> = {};
    for (const f of RISK_FIELDS) {
      const v = Number(limitInputs[f]);
      if (!Number.isFinite(v) || v <= 0) {
        setMsg({ kind: 'err', text: `${RISK_FIELD_LABELS[f]} 必须是正数` });
        return;
      }
      payload[f] = v;
    }
    if (payload.min_stake! >= payload.max_stake!) {
      setMsg({ kind: 'err', text: '单笔下限必须小于单笔上限' });
      return;
    }
    if (payload.min_odds! >= payload.max_odds!) {
      setMsg({ kind: 'err', text: '最低赔率必须小于最高赔率' });
      return;
    }
    setSavingLimits(true);
    setMsg(null);
    try {
      const res = await api.updateRiskLimits(payload);
      const next: Record<string, string> = {};
      for (const f of RISK_FIELDS) next[f] = String(res.limits[f]);
      setLimitInputs(next);
      limits.refresh();
      setMsg({ kind: 'ok', text: '✅ 风控限额已保存，下注即时生效' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingLimits(false);
    }
  };

  const selectMarket = (m: Market) => {
    setMarketId(m.id);
    const next: Record<string, string> = {};
    for (const o of m.odds) next[o.selection] = String(o.price);
    setOddsInputs(next);
  };

  const applyOdds = async () => {
    if (!marketId) {
      setMsg({ kind: 'err', text: '先选择要调赔的市场' });
      return;
    }
    const odds: Record<string, number> = {};
    for (const [sel, raw] of Object.entries(oddsInputs)) {
      const v = Number(raw);
      if (!Number.isFinite(v) || v <= 1) {
        setMsg({ kind: 'err', text: `赔率「${sel}」必须是大于 1 的数字` });
        return;
      }
      odds[sel] = v;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.updateOdds(marketId, odds);
      matches.refresh();
      setMsg({ kind: 'ok', text: '✅ 赔率已更新，前端即时刷新' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const toggleSuspend = async () => {
    if (!marketId || !market) return;
    setBusy(true);
    setMsg(null);
    try {
      if (market.status === 'open') {
        await api.suspendMarket(marketId);
        setMsg({ kind: 'ok', text: '✅ 已挂盘，用户下注将被拒绝' });
      } else if (market.status === 'suspended') {
        await api.resumeMarket(marketId);
        setMsg({ kind: 'ok', text: '✅ 已恢复开盘' });
      } else {
        setMsg({ kind: 'err', text: `市场已 ${MARKET_STATUS_LABELS[market.status] ?? market.status}，不能挂盘/开盘` });
        return;
      }
      matches.refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle style={styles.recordTitle}>📊 交易工具</SectionTitle>

      {/* 风控限额 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>风控限额（下注即时生效）</Text>
        {limits.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
        {limits.error && <Text style={{ color: colors.danger, marginBottom: 8 }}>加载失败：{limits.error}</Text>}
        <View style={styles.limitGrid}>
          {RISK_FIELDS.map((f) => (
            <View key={f} style={styles.limitField}>
              <Text style={styles.limitLabel}>{RISK_FIELD_LABELS[f]}</Text>
              <TextInput
                value={limitInputs[f] ?? ''}
                onChangeText={(t) => setLimitInputs((prev) => ({ ...prev, [f]: t }))}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
                style={styles.limitInput}
              />
            </View>
          ))}
        </View>
        <Button title={savingLimits ? '保存中…' : '保存限额'} onPress={saveLimits} loading={savingLimits} style={{ marginTop: spacing.sm }} />
      </Card>

      {/* 调赔 / 挂盘 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>调赔 / 挂盘</Text>
        {matches.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
        {matches.error && <Text style={{ color: colors.danger, marginBottom: 8 }}>加载失败：{matches.error}</Text>}

        {/* 赛事选择 */}
        <View style={styles.chipWrap}>
          {(matches.data?.matches ?? []).map((m) => (
            <Pressable
              key={m.id}
              onPress={() => {
                setMatchId(m.id);
                setMarketId(null);
                setOddsInputs({});
              }}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: matchId === m.id ? colors.oddsActiveBg : colors.oddsBg, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.chipText, { color: matchId === m.id ? colors.secondary : colors.text }]}>
                #{m.id} {m.home_team} vs {m.away_team}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 市场选择 */}
        {match && (
          <View style={styles.chipWrap}>
            {match.markets.map((mk) => (
              <Pressable
                key={mk.id}
                onPress={() => selectMarket(mk)}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: marketId === mk.id ? colors.oddsActiveBg : colors.oddsBg, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.chipText, { color: marketId === mk.id ? colors.secondary : colors.text }]}>
                  {TYPE_LABELS[mk.type] ?? mk.type}
                  {mk.line != null ? ` @${mk.line}` : ''} · {MARKET_STATUS_LABELS[mk.status] ?? mk.status}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* 调赔输入 */}
        {market && (
          <>
            <View style={styles.limitGrid}>
              {market.odds.map((o) => (
                <View key={o.selection} style={styles.limitField}>
                  <Text style={styles.limitLabel}>{SEL_LABELS[o.selection] ?? o.selection}</Text>
                  <TextInput
                    value={oddsInputs[o.selection] ?? String(o.price)}
                    onChangeText={(t) => setOddsInputs((prev) => ({ ...prev, [o.selection]: t }))}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textMuted}
                    style={styles.limitInput}
                  />
                </View>
              ))}
            </View>
            <View style={styles.row}>
              <Button title={busy ? '处理中…' : '确认调赔'} onPress={applyOdds} loading={busy} style={{ flex: 1 }} />
              <Button
                title={market.status === 'open' ? '挂盘' : market.status === 'suspended' ? '开盘' : '—'}
                onPress={toggleSuspend}
                loading={busy}
                disabled={market.status !== 'open' && market.status !== 'suspended'}
                style={{ flex: 1, marginLeft: spacing.sm }}
              />
            </View>
          </>
        )}

        {!match && !matches.loading && <EmptyState text="暂无赛事，先到管理面板/API 建赛" />}
      </Card>

      {msg && <FlashMsg msg={msg} />}
    </>
  );
}

/** 格式化金额：¥1,234.56 */
function fmtMoney(v: number | undefined | null): string {
  return `¥${(v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** 报表面板：仪表盘卡片 + 趋势 + 热门赛事 + 用户画像（仅 role=admin 可见，Step 33） */
function AnalyticsPanel() {
  const dash = useAnalyticsDashboard();
  const trends = useAnalyticsTrends(14);
  const hot = useAnalyticsHotMatches(5);
  const users = useAnalyticsUsers(5);
  const [refreshing, setRefreshing] = useState(false);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([dash.refresh(), trends.refresh(), hot.refresh(), users.refresh()]);
    setRefreshing(false);
  };

  const d: DashboardStats | null = dash.data?.dashboard ?? null;
  const trendList: TrendPoint[] = trends.data?.trends ?? [];
  const hotList: HotMatch[] = hot.data?.matches ?? [];
  const userList: UserAnalytics[] = users.data?.users ?? [];

  const statCards: { label: string; value: string; color: string }[] = [
    { label: '总投注额', value: d ? fmtMoney(d.totalBetStake) : '—', color: colors.text },
    { label: '总下注数', value: d ? String(d.totalBets) : '—', color: colors.text },
    { label: '总派彩', value: d ? fmtMoney(d.totalPayout) : '—', color: colors.success },
    { label: '净收入', value: d ? fmtMoney(d.netRevenue) : '—', color: d && d.netRevenue < 0 ? colors.danger : colors.text },
    { label: '活跃用户', value: d ? String(d.activeUsers) : '—', color: colors.text },
    { label: '总用户', value: d ? String(d.totalUsers) : '—', color: colors.text },
    { label: '总充值', value: d ? fmtMoney(d.totalDeposits) : '—', color: colors.secondary },
  ];

  const maxStake = Math.max(...trendList.map((t) => t.stake), 1);

  return (
    <>
      <SectionTitle style={styles.recordTitle}>📊 报表（Data Analytics）</SectionTitle>

      {/* 仪表盘卡片 */}
      <Card style={styles.sectionCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>运营总览</Text>
          <Pressable onPress={refreshAll} hitSlop={8}>
            <Text style={{ color: colors.secondary, fontSize: fontSize.sm, fontWeight: font.bold }}>
              {refreshing ? '刷新中…' : '🔄 刷新'}
            </Text>
          </Pressable>
        </View>
        {dash.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
        {dash.error && <Text style={{ color: colors.danger, marginBottom: 8 }}>加载失败：{dash.error}</Text>}
        <View style={styles.statGrid}>
          {statCards.map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                <Text style={{ color: s.color }}>{s.value}</Text>
              </Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* 近 14 天趋势（简版条形图） */}
      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>近 14 天投注/派彩趋势</Text>
        {trends.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
        {trends.error && <Text style={{ color: colors.danger, marginBottom: 8 }}>加载失败：{trends.error}</Text>}
        {!trends.loading && !trends.error && trendList.length === 0 && <EmptyState text="暂无趋势数据" />}
        {trendList.length > 0 && (
          <View>
            {trendList.map((t) => (
              <View key={t.date} style={styles.trendRow}>
                <Text style={styles.trendDate}>{t.date.slice(5)}</Text>
                <View style={styles.trendBarWrap}>
                  <View style={[styles.trendBar, { width: `${Math.max((t.stake / maxStake) * 100, 2)}%`, backgroundColor: colors.secondary }]} />
                </View>
                <Text style={styles.trendVal}>{t.stake > 0 ? fmtMoney(t.stake) : '—'}</Text>
                <Text style={styles.trendSub}>{t.bets}注</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* 热门赛事 Top 5 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>热门赛事 Top 5（按下注额）</Text>
        {hot.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
        {hot.error && <Text style={{ color: colors.danger, marginBottom: 8 }}>加载失败：{hot.error}</Text>}
        {!hot.loading && !hot.error && hotList.length === 0 && <EmptyState text="暂无赛事投注数据" />}
        {hotList.map((m, i) => (
          <View key={m.matchId} style={styles.listRow}>
            <Text style={styles.rankBadge}>#{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.listMain}>{m.homeTeam} vs {m.awayTeam}</Text>
              <Text style={styles.listSub}>{m.bets} 注</Text>
            </View>
            <Text style={styles.listValue}>{fmtMoney(m.stake)}</Text>
          </View>
        ))}
      </Card>

      {/* 用户画像 Top 5 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.cardTitle}>用户画像 Top 5（按下注额）</Text>
        {users.loading && <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />}
        {users.error && <Text style={{ color: colors.danger, marginBottom: 8 }}>加载失败：{users.error}</Text>}
        {!users.loading && !users.error && userList.length === 0 && <EmptyState text="暂无用户投注数据" />}
        {userList.map((u) => (
          <View key={u.userId} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listMain}>#{u.userId} {u.name}</Text>
              <Text style={styles.listSub}>投注 {fmtMoney(u.stake)} · 充值 {fmtMoney(u.deposits)} · {u.bets} 注</Text>
            </View>
            <Text style={[styles.listValue, { color: u.net >= 0 ? colors.success : colors.danger }]}>
              盈亏 {u.net >= 0 ? '+' : ''}{fmtMoney(u.net)}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
}

export default function AccountScreen() {
  const auth = useAuth();
  const { user } = auth;
  const bets = useBets(user?.id);
  const [depositAmt, setDepositAmt] = useState('100');
  const [depositing, setDepositing] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<PaymentOrder | null>(null);
  const [paying, setPaying] = useState(false);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const prefs = usePreferences(user?.id);
  const [favTeam, setFavTeam] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const loadOrders = async () => {
    if (!user) return;
    setLoadingOrders(true);
    try {
      const res = await api.listPaymentOrders();
      setOrders(res.orders);
    } catch {
      // 静默失败，不打断页面
    } finally {
      setLoadingOrders(false);
    }
  };

  /** 第一步：创建充值订单（走支付通道） */
  const createOrder = async () => {
    if (!user) return;
    const amount = Number(depositAmt);
    if (!amount || amount <= 0) {
      setMsg({ kind: 'err', text: '请输入有效金额' });
      return;
    }
    setDepositing(true);
    setMsg(null);
    try {
      const res = await api.createDepositOrder(amount);
      setPendingOrder(res.order);
      loadOrders();
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setDepositing(false);
    }
  };

  /** 第二步：模拟支付（沙箱环境；真实渠道为跳转支付页） */
  const doPay = async () => {
    if (!pendingOrder) return;
    setPaying(true);
    setMsg(null);
    try {
      const res = await api.mockPay(pendingOrder.order_no, 'paid');
      const balance = res.balance ?? user?.balance ?? 0;
      setMsg({ kind: 'ok', text: `✅ 支付成功，已入账 ¥${pendingOrder.amount.toLocaleString()}，余额 ¥${balance.toLocaleString()}` });
      setPendingOrder(null);
      loadOrders();
      // 刷新当前用户对象（余额等字段）
      const fresh = await api.getUser(user!.id);
      auth.update({ ...user!, ...fresh.user });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setPaying(false);
    }
  };

  const cancelOrder = () => setPendingOrder(null);

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
          {user.role === 'admin' && <TradingTools />}
          {user.role === 'admin' && <AnalyticsPanel />}

          {/* 充值（支付通道） */}
          <Card style={styles.sectionCard}>
            <Text style={styles.cardTitle}>充值</Text>
            {!pendingOrder ? (
              <View>
                <View style={styles.row}>
                  <TextInput
                    value={depositAmt}
                    onChangeText={setDepositAmt}
                    keyboardType="numeric"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                  <Button title="创建订单" onPress={createOrder} loading={depositing} style={{ minWidth: 96 }} />
                </View>
                <Text style={styles.hint}>金额 ¥1 ~ ¥100,000 · 支付通道：模拟沙箱（Mock）</Text>
              </View>
            ) : (
              <View>
                <View style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderNo}>订单 {pendingOrder.order_no}</Text>
                    <Text style={styles.orderAmt}>¥{pendingOrder.amount.toLocaleString()} · {PAYMENT_STATUS_LABELS[pendingOrder.status]}</Text>
                  </View>
                  <Pressable onPress={cancelOrder} hitSlop={8}>
                    <Text style={styles.cancelText}>取消</Text>
                  </Pressable>
                </View>
                <Text style={styles.hint}>沙箱环境：点击「模拟支付」即完成支付并回调入账。</Text>
                <Button title="💳 模拟支付" onPress={doPay} loading={paying} style={{ marginTop: spacing.sm }} />
              </View>
            )}
          </Card>

          {/* 充值订单历史 */}
          <Card style={styles.sectionCard}>
            <Text style={styles.cardTitle}>充值订单</Text>
            {loadingOrders && orders.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : orders.length === 0 ? (
              <Text style={styles.hint}>暂无充值订单</Text>
            ) : (
              orders.slice(0, 5).map((o) => (
                <View key={o.id} style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderNo}>{o.order_no}</Text>
                    <Text style={styles.hint}>{o.created_at} · {o.provider}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.orderAmt}>¥{o.amount.toLocaleString()}</Text>
                    <Text style={[styles.orderStatus, { color: o.status === 'paid' ? colors.success : o.status === 'failed' ? colors.danger : colors.textSecondary }]}>
                      {PAYMENT_STATUS_LABELS[o.status]}
                    </Text>
                  </View>
                </View>
              ))
            )}
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
  // 交易工具
  limitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  limitField: { flexBasis: '46%', flexGrow: 1 },
  limitLabel: { color: colors.textSecondary, fontSize: fontSize.xs, marginBottom: 4 },
  limitInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    color: colors.text,
    fontSize: fontSize.md,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8 },
  chipText: { fontSize: fontSize.sm, fontWeight: font.regular },
  betRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  betMain: { color: colors.text, fontSize: fontSize.md, fontWeight: font.bold },
  betSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  betStatus: { fontSize: fontSize.sm, fontWeight: font.bold },
  betPayout: { color: colors.success, fontSize: fontSize.sm, marginTop: 2 },
  optRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  // 支付通道
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.sm },
  orderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  orderNo: { color: colors.text, fontSize: fontSize.md, fontWeight: font.bold },
  orderAmt: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  orderStatus: { fontSize: fontSize.sm, fontWeight: font.bold },
  cancelText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: font.bold },
  // 报表 (Step 33)
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: 'rgba(19,26,46,0.6)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  statValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: font.bold },
  statLabel: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  trendDate: { color: colors.textSecondary, fontSize: fontSize.xs, width: 36 },
  trendBarWrap: { flex: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.sm, overflow: 'hidden', marginHorizontal: spacing.sm },
  trendBar: { height: '100%', borderRadius: radius.sm },
  trendVal: { color: colors.text, fontSize: fontSize.xs, fontWeight: font.bold, minWidth: 64, textAlign: 'right' },
  trendSub: { color: colors.textMuted, fontSize: fontSize.xs, width: 32, textAlign: 'right' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rankBadge: { color: colors.secondary, fontSize: fontSize.sm, fontWeight: font.bold, width: 32 },
  listMain: { color: colors.text, fontSize: fontSize.md, fontWeight: font.bold },
  listSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  listValue: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: font.bold },
});
