// admin 登录页：登录成功回目标页（?from= 或默认大厅）；非 admin/support 提示
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Card, Input, Button, useTheme, fontSize, radius, spacing } from '@betting/ui';
import { useAuth } from '@betting/core';

export default function AdminLogin() {
  const t = useTheme();
  const { login, user } = useAuth();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user && (user.role === 'admin' || user.role === 'support')) {
    return <Redirect href={(typeof from === 'string' && from.startsWith('/admin') ? from : '/admin/matches') as never} />;
  }

  const submit = async () => {
    if (!name.trim() || !password) return setErr('用户名与密码必填');
    setBusy(true);
    setErr('');
    try {
      const u = await login(name.trim(), password);
      if (u.role !== 'admin' && u.role !== 'support') {
        setErr(`角色 ${u.role} 无权访问后台（需 admin/support）`);
        return;
      }
      router.replace(typeof from === 'string' && from.startsWith('/admin') ? from : '/admin/matches');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="admin-login" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
      <Card style={{ padding: spacing.xl, gap: spacing.lg, width: '100%', maxWidth: 380 }}>
        <Text style={{ color: t.secondary, fontSize: 24, fontWeight: '900', textAlign: 'center' }}>Betting Admin</Text>
        <Text style={{ color: t.textMuted, fontSize: fontSize.sm, textAlign: 'center' }}>运营后台（admin / support）· demo: admin/admin123</Text>
        <Input testID="login-name" value={name} onChangeText={setName} placeholder="用户名" autoFocus />
        <Input testID="login-password" value={password} onChangeText={setPassword} placeholder="密码" secureTextEntry onSubmitEditing={submit} />
        {err ? (
          <Text testID="login-error" style={{ color: t.danger, fontSize: fontSize.sm, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: radius.sm, padding: 8 }}>
            {err}
          </Text>
        ) : null}
        <Button testID="login-submit" title={busy ? '登录中…' : '登录'} onPress={submit} disabled={busy} loading={busy} />
      </Card>
    </View>
  );
}
