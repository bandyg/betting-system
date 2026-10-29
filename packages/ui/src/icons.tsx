/**
 * 玩家端线性 SVG 图标系统（替代 emoji）。
 * 全部 24 viewBox、1.7 描边、round 端点，颜色随 currentColor。
 */
import React from 'react';
import type { ColorValue } from 'react-native';
import { Path, Circle, Rect, G } from 'react-native-svg';
import Svg from 'react-native-svg';

const PATHS: Record<string, React.ReactNode> = {
  // 导航
  calendar: (
    <>
      <Rect x={3} y={4} width={18} height={17} rx={2} />
      <Path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  gift: (
    <>
      <Rect x={3} y={8} width={18} height={13} rx={2} />
      <Path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s4 1 6 1zm0 0c2-4 6-4 6-1s-4 1-6 1z" />
    </>
  ),
  ticket: (
    <Path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />
  ),
  user: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="M20 20l-3.5-3.5" />
    </>
  ),
  star: <Path d="M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z" />,
  bell: (
    <>
      <Path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <Path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  lock: (
    <>
      <Rect x={5} y={11} width={14} height={9} rx={2} />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  clock: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 3" />
    </>
  ),
  plus: <Path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <Path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
    </>
  ),
  bolt: <Path d="M13 2L4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" fill="currentColor" stroke="none" />,
  wallet: (
    <>
      <Rect x={3} y={6} width={18} height={14} rx={2} />
      <Path d="M3 10h18M16 15h2" />
    </>
  ),
  fire: (
    <Path d="M12 3s1 3-1.5 5.5S8 12 8 14a4 4 0 0 0 8 0c0-1.5-.7-2.6-1.5-3.5.2 1.2-.3 2-1 2.5.6-2.4-.5-5.5-1.5-7-.4 1.7-1.4 2.6-2 4" />
  ),
  // 运动
  soccer: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7.5l3.5 2.5-1.3 4h-4.4l-1.3-4L12 7.5zM12 3v4.5M19.8 9l-4.3 1M19.8 15.5 15.5 14M4.2 15.5 8.5 14M4.2 9l4.3 1" />
    </>
  ),
  basketball: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 3v18M3 12h18M12 12l6.4-6.4M12 12l6.4 6.4M12 12L5.6 5.6M12 12l-6.4 6.4" />
    </>
  ),
  tennis: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M5 5c3.5 3.5 3.5 10.5 0 14M19 5c-3.5 3.5-3.5 10.5 0 14" />
    </>
  ),
  baseball: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M5.5 5.5C8 8 8 16 5.5 18.5M18.5 5.5C16 8 16 16 18.5 18.5" />
    </>
  ),
  icehockey: (
    <>
      <Path d="M4 4h5l3 11h8" />
      <Circle cx={12} cy={19} r={2.2} />
    </>
  ),
  football: (
    <>
      <Path d="M12 3c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z" />
      <Path d="M12 8v8M9.5 10l5 4M14.5 10l-5 4" />
    </>
  ),
  trophy: (
    <>
      <Path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 5H4.5A3.5 3.5 0 0 0 8 9.5M16 5h3.5A3.5 3.5 0 0 1 16 9.5M12 13v4M8.5 20h7" />
    </>
  ),
  puck: (
    <>
      <ellipse cx={12} cy={16} rx={7} ry={3} />
      <Path d="M5 16v-2c0-1.6 3.1-3 7-3s7 1.4 7 3v2" />
    </>
  ),
  gamepad: (
    <>
      <Path d="M6 9h12a4 4 0 0 1 4 4l-1 5a2 2 0 0 1-3.6.8L15.5 16h-7L6.6 18.8A2 2 0 0 1 3 18l-1-5a4 4 0 0 1 4-4z" />
      <Path d="M8 12h3M9.5 10.5v3M15.5 11.5h.01M17.5 13.5h.01" />
    </>
  ),
  racket: (
    <>
      <Circle cx={14} cy={8} r={5.5} />
      <Path d="M10.2 11.8 4 18M7 15l2.5 2.5" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

/** 线性图标：size 像素、color 缺省随 currentColor */
export function Icon({
  name,
  size = 16,
  color,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </Svg>
  );
}

const SPORT_ICON: Record<string, IconName> = {
  soccer: 'soccer',
  basketball: 'basketball',
  tennis: 'racket',
  baseball: 'baseball',
  icehockey: 'puck',
  americanfootball: 'football',
  football: 'football',
  cricket: 'racket',
  handball: 'soccer',
  rugbyleague: 'football',
  rugbyunion: 'football',
  lacrosse: 'racket',
  golf: 'trophy',
  volleyball: 'soccer',
  tabletennis: 'racket',
  aussierules: 'football',
  boxing: 'trophy',
  mma: 'trophy',
  esports: 'gamepad',
  other: 'trophy',
};

/** 运动图标（key 与 core 的 sport 归一化值一致；未知回落奖杯） */
export function SportIcon({ sport, size = 15, color }: { sport: string | null; size?: number; color?: ColorValue }) {
  const name = SPORT_ICON[sport ?? ''] ?? 'trophy';
  return <Icon name={name} size={size} color={color} />;
}

/** 品牌闪电（头部 logo 用，实心） */
export function SbBolt({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G>
        <Path d="M13 2L4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" fill="#1B1B00" />
      </G>
    </Svg>
  );
}
