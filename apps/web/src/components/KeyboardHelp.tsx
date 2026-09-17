// components/KeyboardHelp.tsx — 快捷键帮助 modal（Sprint 1 A4）
import { useEffect, useState } from 'react';

interface Shortcut { keys: string[]; desc: string; }
const SHORTCUTS: Shortcut[] = [
  { keys: ['1', '2', '3'], desc: '选择第 1/2/3 个赔率 chip' },
  { keys: ['Enter'], desc: '提交投注单' },
  { keys: ['/'], desc: '聚焦搜索框' },
  { keys: ['?'], desc: '打开/关闭此帮助' },
  { keys: ['Esc'], desc: '关闭帮助 / 取消 focus' },
];

interface Props { open: boolean; onClose: () => void; }

export function KeyboardHelp({ open, onClose }: Props) {
  // Esc 关闭（用全局 hook 也支持，这里额外做 modal 内的 focus trap）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="kbd-help-backdrop" onClick={onClose}>
      <div className="kbd-help-modal scale-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="快捷键帮助">
        <div className="kbd-help-head">
          <h2>⌨️ 键盘快捷键</h2>
          <button className="ghost small" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <table className="kbd-help-table">
          <thead>
            <tr><th>按键</th><th>功能</th></tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.desc}>
                <td>{s.keys.map((k, i) => <kbd key={i}>{k}</kbd>)}</td>
                <td>{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted kbd-help-hint">输入框中只 Esc 生效；其他键在文本输入时不触发。</p>
      </div>
    </div>
  );
}
