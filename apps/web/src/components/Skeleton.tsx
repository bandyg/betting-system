// components/Skeleton.tsx — 4 种加载骨架
import type { ReactNode } from 'react';

export function SkeletonLine({ width = '100%' }: { width?: string | number }) {
  return <div className="skeleton skeleton-line" style={{ width }}>&nbsp;</div>;
}

export function SkeletonBlock({ height = 80 }: { height?: number }) {
  return <div className="skeleton skeleton-block" style={{ height }}>&nbsp;</div>;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card fade-in" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <SkeletonLine width="60%" />
          <SkeletonLine width="40%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card fade-in" aria-busy="true" aria-label="加载中">
      <table>
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}><SkeletonLine width="80%" /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}><SkeletonLine /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonAny({ children }: { children?: ReactNode }) {
  return <div className="card fade-in" aria-busy="true">{children ?? <SkeletonList />}</div>;
}
