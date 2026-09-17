// panels/FeedPanel.tsx — 数据源管理（admin 专）
import { useEffect, useState, useCallback } from 'react';
import { api, type FeedLogEntry, type FeedStatus } from '@betting/core';
import { toast } from '../store.js';
import { SkeletonTable } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
}

export function FeedPanel() {
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getFeedStatus();
      setStatus(res as unknown as FeedStatus);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const trigger = async () => {
    setBusy(true);
    try {
      await api.ingestFeedNow();
      toast.ok('Feed 拉取已触发');
      await refresh();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const log: FeedLogEntry[] = status?.feedLog ?? [];

  return (
    <section className="card fade-in">
      <h2>📡 Feed 数据源</h2>
      <div className="row">
        <button onClick={trigger} disabled={busy}>{busy ? '⏳ 拉取中…' : '手动拉取'}</button>
        <button onClick={() => void refresh()} className="ghost small">↻ 刷新</button>
      </div>
      <h3>最近拉取</h3>
      {loading ? <SkeletonTable rows={3} cols={5} /> : log.length === 0 ? (
        <EmptyState icon="📡" title="暂无拉取记录" />
      ) : (
        <table>
          <thead><tr><th>时间</th><th>状态</th><th>seen</th><th>upserted</th><th>errors</th></tr></thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id}>
                <td className="muted">{fmtTime(l.requested_at)}</td>
                <td><span className={`badge ${l.status === 'ok' ? 'open' : 'settled'}`}>{l.status ?? '—'}</span></td>
                <td>{l.matches_seen ?? 0}</td>
                <td>{l.matches_upserted ?? 0}</td>
                <td className="muted">{l.errors ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
