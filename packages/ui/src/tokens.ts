/**
 * 年轻化暗色主题 tokens —— 霓虹渐变（紫→青）+ 玻璃拟态
 * 默认 dark-first，所有组件基于此
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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
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
  bold: '800',
} as const;

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

export type Theme = typeof colors;
