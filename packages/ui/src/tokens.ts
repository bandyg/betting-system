/**
 * 统一设计 tokens —— 单一来源（原 apps/web/src/tokens.ts 已并入）
 * dark neon（紫→青）双主题；duration 为毫秒数、ease 为贝塞尔控制点数组，供 RN 动画直接消费
 */
export const colors = {
  // 主色
  primary: '#7C3AED',        // 紫
  secondary: '#06B6D4',      // 青
  accent: '#F472B6',         // 粉（点缀）

  // 渐变
  gradientStart: '#7C3AED',
  gradientEnd: '#06B6D4',

  // 背景层级（暗色）
  bg: '#0B0F1A',             // 页面底
  bgElevated: '#131A2E',     // 卡片底
  bgGlass: 'rgba(19, 26, 46, 0.72)',  // 玻璃拟态

  // 边框
  border: 'rgba(124, 58, 237, 0.18)',
  borderStrong: 'rgba(6, 182, 212, 0.35)',

  // 文本
  text: '#F4F6FF',
  textSecondary: '#9AA3C0',
  textMuted: '#5C6480',

  // 功能色
  success: '#22C55E',        // 升/赢
  danger: '#EF4444',         // 降/输
  warning: '#F59E0B',
  info: '#06B6D4',

  // 赔率按钮
  oddsBg: 'rgba(124, 58, 237, 0.14)',
  oddsBorder: 'rgba(124, 58, 237, 0.4)',
  oddsActiveBg: 'rgba(6, 182, 212, 0.2)',
  oddsActiveBorder: '#06B6D4',
} as const;

/** 键约束于暗色调色板、值宽化为 string，light 主题可赋值 */
export type Theme = { [K in keyof typeof colors]: string };

/** 亮色主题（同键映射，供 ThemeProvider 切换） */
export const lightColors: Theme = {
  primary: '#5A34D1',
  secondary: '#0891B2',
  accent: '#DB2777',

  gradientStart: '#6D28D9',
  gradientEnd: '#0E7490',

  bg: '#F7F8FC',
  bgElevated: '#FFFFFF',
  bgGlass: 'rgba(255, 255, 255, 0.82)',

  border: 'rgba(58, 91, 215, 0.18)',
  borderStrong: 'rgba(8, 145, 178, 0.35)',

  text: '#1A1F30',
  textSecondary: '#5A6378',
  textMuted: '#8B95B5',

  success: '#1A8A4A',
  danger: '#C0392B',
  warning: '#B07A0A',
  info: '#2A6AD7',

  oddsBg: 'rgba(90, 52, 209, 0.10)',
  oddsBorder: 'rgba(90, 52, 209, 0.35)',
  oddsActiveBg: 'rgba(8, 145, 178, 0.15)',
  oddsActiveBorder: '#0891B2',
};

export const themes = { dark: colors, light: lightColors } as const;
export type ThemeMode = keyof typeof themes;

/** 状态徽章语义分组（取色随主题自动切换） */
export const statusTone: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  scheduled: 'info',
  open: 'info',
  in_progress: 'info',
  settled: 'success',
  resolved: 'success',
  finished: 'warning',
  waiting_user: 'warning',
  suspended: 'warning',
  closed: 'neutral',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** web 并入的 8 档间距梯度（4px 网格） */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 18,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  hero: 40,
} as const;

export const font = {
  regular: '600',
  medium: '500',
  bold: '800',
} as const;

/** 字重（数字形式，admin 表格用） */
export const fw = { normal: 400, medium: 500, semibold: 600, bold: 700 } as const;

/** 动效时长（毫秒） */
export const duration = { fast: 100, normal: 200, slow: 400 } as const;

/** 缓动贝塞尔控制点 [x1, y1, x2, y2]，配合 Easing.bezier(...v) 使用 */
export const ease = {
  out: [0.16, 1, 0.3, 1] as const,
  inOut: [0.4, 0, 0.2, 1] as const,
  spring: [0.34, 1.56, 0.64, 1] as const,
};

/** 层级 */
export const z = { base: 1, dropdown: 10, sticky: 50, fab: 100, toast: 999, modal: 1000, help: 10000 } as const;

/** 组件尺寸 */
export const size = { headerH: 60, betSlipW: 380, fabSize: 52, supportW: 360, supportH: 540 } as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  glow: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;
