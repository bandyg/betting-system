// components/Layout.tsx — header + tabs + outlet + toast host
import { Link, Outlet } from 'react-router-dom';
import { LoginBar } from './LoginBar.js';
import { Tabs } from './Tabs.js';
import { ThemeToggle } from './ThemeToggle.js';
import { ToastHost } from './Toast.js';

export function Layout() {
  return (
    <>
      <header className="top">
        <div>
          <Link to="/matches" style={{ color: 'inherit' }}>
            <h1>🎰 Betting Admin</h1>
          </Link>
          <span className="sub">6 systems / 16 routes / live</span>
        </div>
        <div className="right">
          <LoginBar />
          <ThemeToggle />
        </div>
      </header>
      <Tabs />
      <main className="tab-content fade-in">
        <Outlet />
      </main>
      <ToastHost />
    </>
  );
}
