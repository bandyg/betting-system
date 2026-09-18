// components/OfflineBanner.tsx — 离线/在线状态横幅 (Sprint 4 B5)
//
// 监听 navigator.onLine + window 'online'/'offline' 事件
// 离线时显示提示 banner

import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showOnline, setShowOnline] = useState(false);

  useEffect(() => {
    const goOnline = () => { setOnline(true); setShowOnline(true); window.setTimeout(() => setShowOnline(false), 2500); };
    const goOffline = () => { setOnline(false); setShowOnline(false); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online && !showOnline) return null;
  return (
    <div className={`offline-banner ${online ? 'online-flash' : 'offline'}`} role="status">
      {online ? '✅ 已恢复网络连接' : '⚠️ 网络已断开，部分功能（如下注/账户）可能不可用；浏览缓存数据 OK。'}
    </div>
  );
}