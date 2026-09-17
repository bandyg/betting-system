// components/LoginBar.tsx — 登录条（admin / user）
import { useState, useEffect } from 'react';
import { api } from '@betting/core';
import { useAuth, toast } from '../store.js';

export function LoginBar() {
  const user = useAuth((s: { user: import('@betting/core').User | null }) => s.user);
  const role = useAuth((s: { role: string }) => s.role);
  const setAuth = useAuth((s: { setAuth: (u: import('@betting/core').User | null, role: string, token: string | null) => void }) => s.setAuth);
  const clear = useAuth((s: { clear: () => void }) => s.clear);

  const [name, setName] = useState('admin');
  const [pw, setPw] = useState('');

  // 启动时从 store 恢复 token（store 已经做了 setAuthToken）
  useEffect(() => {
    /* auth store 自己从 localStorage 恢复；这里只确保 api 已带 token */
  }, []);

  const login = async () => {
    try {
      const res = await api.login(name.trim(), pw);
      setAuth(res.user, res.user.role ?? 'user', res.token);
      toast.ok(`✅ ${res.user.name}（${res.user.role}）`);
      setPw('');
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    }
  };

  const logout = () => {
    clear();
    toast.info('已登出');
  };

  return (
    <div className="row" style={{ fontSize: 12 }}>
      {user ? (
        <>
          <span style={{ color: 'var(--success)' }}>🔐 {user.name}
            {user.balance != null && <span className="balance-inline">（¥{user.balance}）</span>}
          </span>
          <span className="muted">role: {role}</span>
          <button className="ghost small" onClick={logout}>登出</button>
        </>
      ) : (
        <>
          <label>用户</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="admin" />
          <label>密码</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} />
          <button onClick={login}>登录</button>
        </>
      )}
    </div>
  );
}
