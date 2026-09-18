// components/Layout.tsx — header + tabs + outlet + toast host + 键盘帮助 (Sprint 1 A4)
import { Link, Outlet } from 'react-router-dom';
import { LoginBar } from './LoginBar.js';
import { Tabs } from './Tabs.js';
import { ThemeToggle } from './ThemeToggle.js';
import { ToastHost } from './Toast.js';
import { KeyboardHelp } from './KeyboardHelp.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboard.js';
import { OfflineBanner } from './OfflineBanner.js';
import { useT } from '../i18n.js';
import { Avatar } from './Avatar.js';
import { useAuth } from '../store.js';

export function Layout() {
  const kbd = useKeyboardShortcuts();
  const { lang, setLang } = useT();
  const user = useAuth((s: { user: { name: string } | null }) => s.user);
  const toggleLang = () => setLang(lang === 'zh-CN' ? 'en' : 'zh-CN');

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
          {user && (
            <span className="user-greeting" title={user.name}>
              <Avatar name={user.name} size={24} />
              <span className="user-name">{user.name}</span>
            </span>
          )}
          <button
            className="ghost small lang-toggle"
            onClick={toggleLang}
            title="切换语言 / Switch language"
            aria-label="Toggle language"
          >
            {lang === 'zh-CN' ? '中' : 'EN'}
          </button>
          <button
            className="ghost small"
            onClick={kbd.openHelp}
            title="键盘快捷键 (按 ? 打开)"
            aria-label="键盘快捷键帮助"
          >
            ⌨️
          </button>
          <LoginBar />
          <ThemeToggle />
        </div>
      </header>
      <OfflineBanner />
      <Tabs />
      <main className="tab-content fade-in">
        <Outlet />
      </main>
      <ToastHost />
      <KeyboardHelp open={kbd.helpOpen} onClose={kbd.closeHelp} />
    </>
  );
}