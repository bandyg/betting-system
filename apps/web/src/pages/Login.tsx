// pages/Login.tsx — 独立登录页（居中卡片）
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '@betting/core';
import { useAuth, toast } from '../store.js';

export function LoginPage() {
  const user = useAuth((s: { user: import('@betting/core').User | null }) => s.user);
  const setAuth = useAuth((s: { setAuth: (u: import('@betting/core').User | null, role: string, token: string | null) => void }) => s.setAuth);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // 已登录则直接跳走（避免回登录页）
  useEffect(() => {
    if (user) {
      const from = params.get('from') || '/matches';
      navigate(from, { replace: true });
    }
  }, [user, params, navigate]);

  const [name, setName] = useState('admin');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || !pw) { setErr('请输入用户名和密码'); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.login(name.trim(), pw);
      setAuth(res.user, res.user.role ?? 'user', res.token);
      toast.ok(`✅ ${res.user.name}（${res.user.role}）`);
      const from = params.get('from') || '/matches';
      navigate(from, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      toast.err(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page fade-in">
      <div className="login-card">
        <div className="login-logo">🎰</div>
        <h1 className="login-title">Betting Admin</h1>
        <p className="login-sub">登录以继续</p>

        <form onSubmit={submit} className="login-form">
          <div className="field">
            <label htmlFor="login-name">用户名</label>
            <input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="admin"
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="login-pw">密码</label>
            <input
              id="login-pw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <label className="remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>记住我</span>
          </label>

          {err && <div className="msg err" role="alert">{err}</div>}

          <button type="submit" className="primary" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
        </form>

        <div className="login-footer">
          <span className="muted">还没有账号？</span>
          <button type="button" className="ghost small" disabled title="注册即将开放">
            注册（即将开放）
          </button>
        </div>

        <p className="login-hint muted">
          演示账号：<code>admin / admin123</code> 或任意 <code>/users</code> 注册用户
        </p>
      </div>
    </div>
  );
}
