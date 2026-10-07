// admin 键盘快捷键（仅 web）：ref 注册表替代旧版 DOM querySelector
// - 1/2/3：点选当前大厅第 N 个赔率筹码
// - Enter：提交下注
// - ?：快捷键帮助
// - Esc：关闭弹窗（Modal 自带 Esc 监听，这里只兜底 blur）
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Modal, useTheme } from '@betting/ui';
import { fontSize, radius, spacing } from '@betting/ui';

interface KeyboardRegistry {
  /** 注册可见赔率筹码（order 从 1 开始），返回反注册函数 */
  registerOdds: (order: number, cb: () => void) => () => void;
  /** 注册“提交下注”回调 */
  registerSubmit: (cb: () => void) => () => void;
}

const Ctx = createContext<KeyboardRegistry>({
  registerOdds: () => () => {},
  registerSubmit: () => () => {},
});

export const useKeyboardRegistry = () => useContext(Ctx);

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const oddsRef = useRef(new Map<number, () => void>());
  const submitRef = useRef<(() => void) | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        oddsRef.current.get(Number(e.key))?.();
      } else if (e.key === 'Enter') {
        submitRef.current?.();
      } else if (e.key === '?') {
        setHelpOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const reg: KeyboardRegistry = {
    registerOdds: (order, cb) => {
      oddsRef.current.set(order, cb);
      return () => oddsRef.current.delete(order);
    },
    registerSubmit: (cb) => {
      submitRef.current = cb;
      return () => {
        if (submitRef.current === cb) submitRef.current = null;
      };
    },
  };

  return (
    <Ctx.Provider value={reg}>
      {children}
      <KeyboardHelp visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </Ctx.Provider>
  );
}

const SHORTCUTS: [string, string][] = [
  ['1 / 2 / 3', '选择大厅第 N 个赔率筹码'],
  ['Enter', '提交下注（打开确认弹窗）'],
  ['?', '打开/关闭本帮助'],
  ['Esc', '关闭弹窗'],
];

function KeyboardHelp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} onClose={onClose} title="⌨️ 快捷键" testID="kbd-help" width={380}>
      <View style={{ gap: spacing.md }}>
        {SHORTCUTS.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ backgroundColor: t.bg, borderColor: t.borderStrong, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2, minWidth: 84, alignItems: 'center' }}>
              <Text style={{ color: t.secondary, fontSize: fontSize.sm, fontWeight: '800' }}>{k}</Text>
            </View>
            <Text style={{ color: t.textSecondary, fontSize: fontSize.sm, flex: 1 }}>{v}</Text>
          </View>
        ))}
        <Text style={{ color: t.textMuted, fontSize: fontSize.xs }}>仅在 Web 端生效；输入框内不触发</Text>
      </View>
    </Modal>
  );
}
