// main.tsx — React 入口，ErrorBoundary + 主题 + i18n + ErrorReporter + Service Worker + BrowserRouter
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { initTheme } from './store.js';
import { I18nProvider } from './i18n.js';
import { setupErrorReporter } from './lib/ErrorReporter.js';
import './styles/index.css';
import App from './App.js';

initTheme();
setupErrorReporter();

// 注册 Service Worker (PWA 离线缓存) (Sprint 4 B5)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => console.info('[PWA] SW registered, scope=', reg.scope),
      (err) => console.warn('[PWA] SW register failed:', err),
    );
  });
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <I18nProvider>
          <App />
        </I18nProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);