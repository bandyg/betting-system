import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { useTheme } from './theme';
import { fontSize } from './tokens';

/**
 * MiniChart —— SVG 折线图（网格 + 折线 + 渐变填充）
 * 数据为空或恒定时安全渲染占位。
 */
export function MiniChart({
  data,
  width,
  height = 64,
  label,
  testID = 'mini-chart',
}: {
  data: number[];
  width?: number;
  height?: number;
  label?: string;
  testID?: string;
}) {
  const t = useTheme();
  const dims = useWindowDimensions();
  const w = width ?? Math.min(dims.width - 80, 360);
  const h = height;
  const pad = 4;

  const valid = data.filter((n) => typeof n === 'number' && isFinite(n));
  if (valid.length < 2) {
    return (
      <View testID={testID} style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>暂无走势</Text>
      </View>
    );
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;
  const dx = (w - pad * 2) / (valid.length - 1);
  const pts = valid.map((v, i) => ({ x: pad + i * dx, y: pad + (1 - (v - min) / span) * (h - pad * 2) }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${h - pad} L${pts[0].x.toFixed(1)},${h - pad} Z`;
  const up = valid[valid.length - 1] >= valid[0];
  const stroke = up ? t.success : t.danger;

  return (
    <View testID={testID} style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id="mc-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity="0.28" />
            <Stop offset="1" stopColor={stroke} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line key={f} x1={pad} y1={pad + f * (h - pad * 2)} x2={w - pad} y2={pad + f * (h - pad * 2)} stroke={t.border} strokeWidth="1" />
        ))}
        <Path d={area} fill="url(#mc-fill)" />
        <Path d={line} fill="none" stroke={stroke} strokeWidth="2" />
      </Svg>
      {label ? (
        <Text style={{ position: 'absolute', right: 0, top: 0, color: t.textMuted, fontSize: fontSize.xs }}>{label}</Text>
      ) : null}
    </View>
  );
}
