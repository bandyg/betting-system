import React, { createContext, useContext, useMemo, useState } from 'react';
import { colors, lightColors, type Theme, type ThemeMode } from './tokens';

type ThemeCtx = {
  /** 当前调色板（保持既有 useTheme() 返回形状，组件无感切换） */
  palette: Theme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
};

const Ctx = createContext<ThemeCtx>({
  palette: colors,
  mode: 'dark',
  setMode: () => {},
});

/**
 * 双主题 Provider。mode 可由宿主 app 受控（接自己的持久化 store）；
 * 不传则内部持有，默认 dark（玩家端既有行为不变）。
 */
export const ThemeProvider: React.FC<{
  children: React.ReactNode;
  mode?: ThemeMode;
  onModeChange?: (m: ThemeMode) => void;
}> = ({ children, mode, onModeChange }) => {
  const [inner, setInner] = useState<ThemeMode>('dark');
  const current = mode ?? inner;
  const value = useMemo<ThemeCtx>(
    () => ({
      palette: current === 'light' ? lightColors : colors,
      mode: current,
      setMode: (m) => {
        if (!mode) setInner(m);
        onModeChange?.(m);
      },
    }),
    [current, mode, onModeChange],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/** 取当前调色板（组件内消费颜色） */
export const useTheme = () => useContext(Ctx).palette;

/** 取/切主题模式（admin 主题切换用） */
export const useThemeMode = () => useContext(Ctx);
