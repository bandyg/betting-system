// apps/web/src/tokens.ts — Web Design Tokens (Sprint 5 C5)
//
// 与 CSS (styles/reset.css) 镜像的 TypeScript 导出
// 用于: Storybook, 类型安全, mobile/web 共享 (待 packages/ui 合并)
//
// 改这里 = 改 reset.css (手动同步, 单向)

export const tokens = {
  // Spacing (4px 网格)
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 },

  // Radius
  radius: { sm: 4, md: 6, lg: 10, xl: 14, '2xl': 18, full: 9999 },

  // Font Sizes
  text: { xs: 10, sm: 12, md: 13, base: 14, lg: 16, xl: 18, '2xl': 20, '3xl': 28 },

  // Font Weights
  fw: { normal: 400, medium: 500, semibold: 600, bold: 700 },

  // Animation
  duration: { fast: '0.1s', normal: '0.2s', slow: '0.4s' },
  ease: {
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  // Z-Index Scale
  z: { base: 1, dropdown: 10, sticky: 50, fab: 100, toast: 999, modal: 1000, help: 10000 },

  // Component Sizes
  size: { headerH: 60, betSlipW: 380, fabSize: 52, supportW: 360, supportH: 540 },

  // Dark theme palette (default)
  dark: {
    bg: '#0f1420',
    bgCard: '#171e30',
    bgCard2: '#1d2539',
    bgElevated: '#1d2539',
    border: '#26304d',
    borderStrong: '#2a3350',
    fg: '#e8ecf4',
    fgMuted: '#6b7699',
    fgSubtle: '#8b95b5',
    accent: '#4a6cf7',
    accentHover: '#3a5ef0',
    success: '#7ee2a8',
    danger: '#ff9db0',
    warning: '#ffe07c',
    info: '#7cc0ff',
  },

  // Light theme palette
  light: {
    bg: '#f7f8fc',
    bgCard: '#ffffff',
    bgCard2: '#f0f3fa',
    bgElevated: '#f0f3fa',
    border: '#d8def0',
    borderStrong: '#b8c2d8',
    fg: '#1a1f30',
    fgMuted: '#6b7390',
    fgSubtle: '#5a6378',
    accent: '#3a5bd7',
    accentHover: '#2a4bc7',
    success: '#1a8a4a',
    danger: '#c0392b',
    warning: '#b07a0a',
    info: '#2a6ad7',
  },
} as const;

export type Tokens = typeof tokens;

/** Helper: get value with type safety */
export function t<K extends keyof Tokens>(category: K, key: keyof Tokens[K]): string | number {
  return (tokens[category] as any)[key];
}