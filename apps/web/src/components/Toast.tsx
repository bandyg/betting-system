// components/Toast.tsx + ToastHost.tsx — 4 色 toast
import { useToast } from '../store.js';

export function ToastHost() {
  const toasts = useToast((s: { toasts: { id: number; kind: string; text: string }[] }) => s.toasts);
  const dismiss = useToast((s: { dismiss: (id: number) => void }) => s.dismiss);

  if (toasts.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          onClick={() => dismiss(t.id)}
          role="alert"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
