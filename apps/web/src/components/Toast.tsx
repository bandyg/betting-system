// components/Toast.tsx + ToastHost.tsx — 4 色 toast + action 按钮 (Sprint 1 B1)
import { useToast } from '../store.js';

export function ToastHost() {
  const toasts = useToast((s: { toasts: { id: number; kind: string; text: string; action?: { label: string; onClick: () => void } }[] }) => s.toasts);
  const dismiss = useToast((s: { dismiss: (id: number) => void }) => s.dismiss);

  if (toasts.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          role="alert"
        >
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={(e) => { e.stopPropagation(); t.action!.onClick(); }}
            >
              {t.action.label}
            </button>
          )}
          <button
            className="toast-close"
            onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
            aria-label="关闭"
          >✕</button>
        </div>
      ))}
    </div>
  );
}
