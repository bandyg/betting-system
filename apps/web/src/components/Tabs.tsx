// components/Tabs.tsx — 顶部 tab 导航
import { NavLink } from 'react-router-dom';
import { useAuth } from '../store.js';

interface TabDef { path: string; label: string; icon: string; admin?: boolean; support?: boolean; }

const TABS: TabDef[] = [
  { path: '/matches',         label: '赛事',     icon: '⚽' },
  { path: '/bets',            label: '下注',     icon: '🎯' },
  { path: '/history',         label: '我的投注', icon: '📜' },
  { path: '/admin/accounts',  label: '账户',     icon: '👥',  admin: true },
  { path: '/admin/matches',   label: '建赛',     icon: '➕',  admin: true },
  { path: '/admin/settle',    label: '结算',     icon: '🏁',  admin: true },
  { path: '/admin/feed',      label: '数据源',   icon: '📡',  admin: true },
  { path: '/admin/support',   label: '客服',     icon: '💬',  admin: true, support: true },
];

export function Tabs() {
  const role = useAuth((s: { role: string }) => s.role);
  const isAdmin = role === 'admin';
  const isSupport = role === 'support' || role === 'admin';

  const visible = TABS.filter((t) => {
    if (t.admin && !isAdmin) return false;
    if (t.support && !isSupport) return false;
    return true;
  });

  return (
    <nav className="tab-bar" role="tablist" aria-label="主导航">
      {visible.map((t) => (
        <NavLink
          key={t.path}
          to={t.path}
          className={({ isActive }) => `tab-item${isActive ? ' active' : ''}`}
          role="tab"
        >
          <span className="tab-icon" aria-hidden>{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
