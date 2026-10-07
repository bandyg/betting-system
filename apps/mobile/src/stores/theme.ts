// admin 明暗主题持久化 store（AsyncStorage；web 端该库自动落 localStorage）
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from '@betting/ui';

interface ThemeStore {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      mode: 'dark',
      setMode: (mode) => set({ mode }),
    }),
    { name: 'betting.adminTheme', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
