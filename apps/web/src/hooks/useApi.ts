// hooks/useApi.ts — 通用 fetch hook：loading/error/data 三态
import { useCallback, useEffect, useState } from 'react';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fn();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, tick, ...deps]);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, loading, error, refetch: () => setTick((n) => n + 1) };
}
