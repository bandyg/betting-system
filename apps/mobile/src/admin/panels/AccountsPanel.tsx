// 账户面板（admin 专）：建用户 / 选用户充值 / 用户列表
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api, type User } from '@betting/core';
import { Card, DataTable, Input, Select, SectionTitle, Button, toast, useTheme, fontSize, spacing } from '@betting/ui';

export function AccountsPanel() {
  const t = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [deposit, setDeposit] = useState('1000');
  const [loading, setLoading] = useState(true);

  const refreshUsers = useCallback(async () => {
    try {
      const res = await api.listUsers();
      setUsers(res.users);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  const loadUser = async (id: number) => {
    try {
      const res = await api.getUser(id);
      setUser(res.user);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const createUser = async () => {
    if (!name.trim()) return toast.warn('请输入用户名');
    try {
      const res = await api.createUser(name.trim());
      toast.ok(`创建成功：#${res.user.id} ${res.user.name}`);
      setName('');
      await refreshUsers();
      setSelId(res.user.id);
      setUser(res.user);
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const doDeposit = async () => {
    if (selId == null) return toast.warn('先选择用户');
    const amt = Number(deposit);
    if (!(amt > 0)) return toast.warn('金额必须大于 0');
    try {
      const res = await api.deposit(selId, amt);
      toast.ok(`充值成功：余额 → ¥${res.account.balance}`);
      await loadUser(selId);
      await refreshUsers();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card testID="panel-accounts" style={{ padding: spacing.lg, gap: spacing.md }}>
      <SectionTitle>👤 账户</SectionTitle>
      <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input testID="accounts-new-name" value={name} onChangeText={setName} placeholder="新用户名" style={{ flex: 1, minWidth: 140 }} />
        <Button title="创建" onPress={createUser} style={{ paddingHorizontal: spacing.lg }} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          testID="accounts-user-select"
          value={selId}
          onChange={(v) => {
            setSelId(v);
            void loadUser(v);
          }}
          placeholder="选择用户"
          options={users.map((u) => ({ value: u.id, label: `#${u.id} ${u.name}` }))}
        />
        <Input testID="accounts-deposit" value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" style={{ width: 110 }} />
        <Button title="充值" variant="ghost" onPress={doDeposit} style={{ paddingHorizontal: spacing.lg }} />
      </View>
      {user ? (
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <Text style={{ color: t.textMuted, fontSize: fontSize.sm }}>
            #{user.id} {user.name}
          </Text>
          <Text style={{ color: t.success, fontWeight: '800' }}>¥{user.balance}</Text>
        </View>
      ) : null}
      <SectionTitle>用户列表</SectionTitle>
      <DataTable<User>
        testID="accounts-table"
        loading={loading}
        emptyText="暂无用户"
        rows={users}
        keyExtractor={(u) => String(u.id)}
        columns={[
          { key: 'id', label: '#', flex: 0.5 },
          { key: 'name', label: '名称', flex: 2 },
          { key: 'balance', label: '余额', flex: 1, align: 'right', render: (u) => <Text style={{ color: t.success, fontWeight: '700' }}>¥{u.balance}</Text> },
        ]}
      />
    </Card>
  );
}
