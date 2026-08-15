import React, { createContext, useContext } from 'react';
import { colors } from './tokens';

const ThemeContext = createContext(colors);
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>
);
export const useTheme = () => useContext(ThemeContext);
