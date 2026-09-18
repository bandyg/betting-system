// lib/ErrorReporter.ts — 前端错误全局捕获 (Sprint 3 batch2)
//
// 监听 window.onerror + unhandledrejection, 写到 console + localStorage
// 后续可加 Sentry / 自建上报端点 (只 console.log 演示)

const STORAGE_KEY = 'app.errors';

export function setupErrorReporter() {
  if (typeof window === 'undefined') return;
  // 避免重复注册
  if ((window as any).__errorReporterInstalled) return;
  (window as any).__errorReporterInstalled = true;

  const save = (entry: any) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push({ ...entry, ts: Date.now() });
      // 只保留最近 50 条
      while (arr.length > 50) arr.shift();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch { /* ignore */ }
  };

  window.addEventListener('error', (e) => {
    const entry = {
      kind: 'error',
      msg: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error instanceof Error ? e.error.stack : undefined,
    };
    console.error('[ErrorReporter]', entry);
    save(entry);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const entry = {
      kind: 'unhandledrejection',
      msg: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    };
    console.error('[ErrorReporter]', entry);
    save(entry);
  });

  // 暴露调试 API
  (window as any).__getErrors = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  };
  (window as any).__clearErrors = () => {
    localStorage.removeItem(STORAGE_KEY);
  };
}