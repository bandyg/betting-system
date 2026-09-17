// components/LoginBar.tsx — 头部用户信息条（已登录时显示 + 登出 + 去登录）
import { Link } from 'react-router-dom';
import { useAuth, toast } from '../store.js';

export function LoginBar() {
  const user = useAuth((s: { user: import('@betting/core').User | null }) => s.user);
  const role = useAuth((s: { role: string }) => s.role);
  const clear = useAuth((s: { clear: () => void }) => s.clear);

  const logout = () => {
    clear();
    toast.info('已登出');
  };

  if (!user) {
    return (
      <div className="row" style={{ fontSize: 12 }}>
        <Link to="/login">
          <button className="ghost small">🔑 登录</button>
        </Link>
      </div>
    );
  }

  return (
    <div className="row" style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--success)' }}>
        🔐 {user.name}
        {user.balance != null && <span className="balance-inline">（¥{user.balance}）</span>}
      </span>
      <span className="muted">role: {role || 'user'}</span>
      <button className="ghost small" onClick={logout}>登出</button>
    </div>
  );
}
