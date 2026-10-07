// 全局错误收集（环形缓冲，最多 50 条）
// - web：window.onerror + unhandledrejection
// - native：global.ErrorUtils.setGlobalHandler
// 调试：__getErrors() / __clearErrors()（dev 下挂到 global）

const MAX = 50;
const errors: { time: number; message: string; stack?: string }[] = [];

function record(err: { message?: string; stack?: string }) {
  try {
    errors.push({
      time: Date.now(),
      message: err.message || String(err),
      stack: err.stack,
    });
    if (errors.length > MAX) errors.splice(0, errors.length - MAX);
  } catch {
    /* ignore */
  }
}

export function getErrors() {
  return [...errors];
}

export function clearErrors() {
  errors.length = 0;
}

export function setupErrorReporter() {
  const g = globalThis as unknown as {
    onerror?: ((msg: string, src: string, line: number, col: number, err: Error) => void) | null;
    ErrorUtils?: { setGlobalHandler: (h: (err: Error, isFatal?: boolean) => void) => void };
  };

  if (typeof window !== 'undefined') {
    window.onerror = (msg, _src, _line, _col, err) => {
      record(err ?? { message: String(msg) });
      return false;
    };
    window.addEventListener('unhandledrejection', (e) => record((e as PromiseRejectionEvent).reason ?? { message: 'unhandledrejection' }));
  }
  if (g.ErrorUtils?.setGlobalHandler) {
    g.ErrorUtils.setGlobalHandler((err, _isFatal) => record(err ?? { message: 'unknown' }));
  }
  if ((globalThis as { __DEV__?: boolean }).__DEV__) {
    (globalThis as Record<string, unknown>).__getErrors = getErrors;
    (globalThis as Record<string, unknown>).__clearErrors = clearErrors;
  }
}
