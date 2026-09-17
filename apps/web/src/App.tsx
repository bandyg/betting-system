// App.tsx — 入口：route 配置 + layout shell + basket state（跨页共享）
import { useCallback, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { MatchesExplorer } from './panels/MatchesExplorer.js';
import { AccountsPanel } from './panels/AccountsPanel.js';
import { MatchesAdminPanel } from './panels/MatchesAdminPanel.js';
import { BetSlip, type BasketItem } from './panels/BetSlip.js';
import { BetsPanel } from './panels/BetsPanel.js';
import { SettlePanel } from './panels/SettlePanel.js';
import { FeedPanel } from './panels/FeedPanel.js';
import { SupportPanel } from './panels/SupportPanel.js';
import { EmptyState } from './components/EmptyState.js';
import { useAuth } from './store.js';
import type { Match, Market, OddsItem } from '@betting/core';

/** 公共 wrapper：未登录时给引导 */
function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuth((s: { user: import('@betting/core').User | null }) => s.user);
  if (!user) {
    return (
      <EmptyState
        icon="🔒"
        title="请先登录"
        desc="该功能需要登录后使用"
        action={<a href="/matches"><button>返回大厅</button></a>}
      />
    );
  }
  return children;
}

/** 大厅（K 轮 bet365 双栏） */
function LobbyPage() {
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const pickedKeys = useMemo(() => new Set(basket.map((b) => b.key)), [basket]);

  const handlePick = useCallback((m: Match, mk: Market, o: OddsItem) => {
    const key = `${mk.id}:${o.selection}`;
    setBasket((b) => (b.some((i) => i.key === key) ? b : [...b, {
      key,
      marketId: mk.id,
      matchLabel: `${m.home_team} vs ${m.away_team}`,
      marketLabel: `${mk.type}${mk.line != null ? ` @${mk.line}` : ''}`,
      selection: o.selection,
      price: o.price,
    }]));
  }, []);

  return (
    <div className="lobby-layout">
      <div className="lobby-list">
        <MatchesExplorer onPick={handlePick} pickedKeys={pickedKeys} />
      </div>
      <aside className="lobby-basket">
        <BetSlip
          items={basket}
          onRemove={(k) => setBasket((b) => b.filter((i) => i.key !== k))}
          onClear={() => setBasket([])}
        />
      </aside>
    </div>
  );
}

/** 管理页（仅 admin/support） */
function AdminPage() {
  const role = useAuth((s: { role: string }) => s.role);
  if (role !== 'admin' && role !== 'support') {
    return <Navigate to="/matches" replace />;
  }
  return (
    <div className="fade-in">
      <div className="grid">
        <AccountsPanel />
        <MatchesAdminPanel />
      </div>
      <div className="grid">
        <SettlePanel />
        <FeedPanel />
      </div>
      {role !== 'support' && <SupportPanel />}
    </div>
  );
}

function NotFoundPage() {
  return (
    <EmptyState
      icon="🚧"
      title="404 — 页面不存在"
      desc="你访问的 URL 没有对应的页面"
      action={<a href="/matches"><button>返回大厅</button></a>}
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/matches" replace />} />
        <Route path="/matches" element={<LobbyPage />} />
        <Route path="/bets" element={<RequireAuth><BetSlip items={[]} onRemove={() => {}} onClear={() => {}} /></RequireAuth>} />
        <Route path="/history" element={<RequireAuth><BetsPanel /></RequireAuth>} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
