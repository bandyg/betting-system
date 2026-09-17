// components/ThemeToggle.tsx — dark/light 切换按钮
import { useTheme } from '../store.js';

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  return (
    <button
      className="ghost small"
      onClick={toggle}
      title={`切换到 ${theme === 'dark' ? '亮色' : '暗色'}主题`}
      aria-label="切换主题"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
