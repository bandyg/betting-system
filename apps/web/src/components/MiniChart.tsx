// components/MiniChart.tsx — SVG 折线图 (Sprint 3 #A2v2 + #C1 起步)
// 极简实现: SVG path + 坐标 + tooltip
// 无外部依赖
//
// 用法: <MiniChart data={[2.10, 2.05, 2.20, 2.30, 2.25, 2.40]} label="主胜赔率" />

import { useMemo, useState } from 'react';

interface Props {
  data: number[];
  label?: string;
  width?: number;
  height?: number;
  color?: string;
}

export function MiniChart({ data, label = '', width = 200, height = 50, color = 'var(--accent)' }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const padding = 4;

  const { path, dots, minV, maxV } = useMemo(() => {
    if (data.length === 0) return { path: '', dots: [], minV: 0, maxV: 0 };
    const minV = Math.min(...data);
    const maxV = Math.max(...data);
    const range = maxV - minV || 1;
    const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
    const points = data.map((v, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((v - minV) / range) * (height - padding * 2);
      return { x, y, v };
    });
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return { path, dots: points, minV, maxV };
  }, [data, width, height, padding]);

  if (data.length === 0) {
    return <div className="muted" style={{ fontSize: 11, padding: 4 }}>暂无数据</div>;
  }

  return (
    <div className="mini-chart" style={{ width, height, position: 'relative' }}>
      <svg width={width} height={height} className="mini-chart-svg">
        {/* 网格 */}
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="var(--border)" strokeDasharray="2 2" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border)" strokeDasharray="2 2" />
        {/* 折线 */}
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        {/* 填充 */}
        <path d={`${path} L ${dots[dots.length - 1].x} ${height - padding} L ${dots[0].x} ${height - padding} Z`} fill={color} opacity={0.1} />
        {/* 节点 */}
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={hover === i ? 3.5 : 2}
            fill={color}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'pointer' }}
          />
        ))}
      </svg>
      {hover != null && (
        <div className="mini-chart-tip" style={{ left: Math.min(dots[hover].x - 20, width - 50), top: dots[hover].y - 24 }}>
          {label ? `${label}: ` : ''}{dots[hover].v.toFixed(2)}
        </div>
      )}
    </div>
  );
}