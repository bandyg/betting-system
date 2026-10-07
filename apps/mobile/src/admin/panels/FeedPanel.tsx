// Feed 数据源面板（admin 专）：手动拉取 + 拉取日志表
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api, type FeedLogEntry, type FeedStatus } from '@betting/core';
import { Card, DataTable, SectionTitle, Button, Badge, toast, useTheme, spacing } from '@betting/ui';
import { fmtTime } from '../lib';

export function FeedPanel() {
  const t = useTheme();
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    <Card testID="panel-feed" style={{ padding: spacing.lg, gap: spacing.md }}>
      <SectionTitle>📡 Feed 数据源</SectionTitle>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Button testID="feed-trigger" title={busy ? '⏳ 拉取中…' : '手动拉取'} onPress={trigger} disabled={busy} loading={busy} style={{ paddingHorizontal: spacing.lg }} />
        <Button title="↻ 刷新" variant="ghost" onPress={() => void refresh()} style={{ paddingHorizontal: spacing.lg }} />
      </View>
      <SectionTitle>最近拉取</SectionTitle>
      <DataTable<FeedLogEntry>
        testID="feed-table"
        loading={loading}
        emptyText="暂无拉取记录"
        rows={log}
        keyExtractor={(l, i) => String(l.id ?? i)}
        columns={[
          { key: 'requested_at', label: '时间', flex: 2, render: (l) => <Text style={{ color: t.textMuted }}>{fmtTime(l.requested_at)}</Text> },
          { key: 'status', label: '状态', flex: 1, render: (l) => <Badge status={l.status === 'ok' ? 'open' : 'settled'} label={l.status ?? '—'} /> },
          { key: 'matches_seen', label: 'seen', flex: 0.7, align: 'right', render: (l) => <Text>{l.matches_seen ?? 0}</Text> },
          { key: 'matches_upserted', label: 'upserted', flex: 0.8, align: 'right', render: (l) => <Text>{l.matches_upserted ?? 0}</Text> },
          { key: 'errors', label: 'errors', flex: 2, render: (l) => <Text style={{ color: t.textMuted }} numberOfLines={1}>{l.errors ?? '—'}</Text> },
        ]}
      />
    </Card>
  );
}
