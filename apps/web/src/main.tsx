// main.tsx — React 入口，包 ErrorBoundary + 主题初始化 + BrowserRouter
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { initTheme } from './store.js';
import './styles/index.css';
import App from './App.js';

initTheme();

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
