// hooks/useKeyboard.ts — 全局键盘快捷键（Sprint 1 A4）
//
// 注册全局 keydown，按键映射：
//   1/2/3     → 在赛事页选择第 N 个可见的 odds-chip（含赔率数字）
//   Enter     → 在投注单有内容时提交（找 "提交下注" 按钮 click）
//   /         → 聚焦 MatchesExplorer 搜索框
//   ? / Shift+/ → 打开/关闭快捷键帮助 modal
//   Esc       → 关闭 modal / 取消 focus
//
// 文本输入框/textarea 聚焦时不触发全局快捷键（除 Esc）。
//
// 用 window.addEventListener('keydown')，通过 React context 分发到具体 hook。

import { useEffect, useState, useCallback } from 'react';

export interface KeyboardApi {
  /** 打开帮助 modal */
  openHelp: () => void;
  /** 关闭帮助 modal */
  closeHelp: () => void;
  /** 当前 modal 是否打开 */
  helpOpen: boolean;
}

let _helpOpenListeners: Array<(open: boolean) => void> = [];

/** 触发打开帮助（供 hotkey 之外的入口如按钮调用） */
export function showKeyboardHelp(): void {
  _helpOpenListeners.forEach((fn) => fn(true));
}

export function useKeyboardShortcuts(): KeyboardApi {
  const [helpOpen, setHelpOpen] = useState(false);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  useEffect(() => {
    const cb = (open: boolean) => setHelpOpen(open);
    _helpOpenListeners.push(cb);
    return () => {
      _helpOpenListeners = _helpOpenListeners.filter((f) => f !== cb);
    };
  }, []);

  useEffect(() => {
    const isTyping = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const handler = (e: KeyboardEvent) => {
      // Esc 任何时候都生效（即使在输入框）— 用于关闭 modal / 取消 focus
      if (e.key === 'Escape') {
        if (helpOpen) {
          setHelpOpen(false);
          e.preventDefault();
          return;
        }
        // 没 modal 时清 focus
        const ae = document.activeElement;
        if (ae instanceof HTMLElement) ae.blur();
        return;
      }

      // 其他键在输入框中不触发
      if (isTyping(e.target)) return;

      // 修饰键不处理
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // / → 聚焦搜索框
      if (e.key === '/') {
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="搜索队名"]');
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
        return;
      }

      // ? / Shift+/ → 帮助
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Enter → 提交投注单
      if (e.key === 'Enter') {
        const submitBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
          .find((b) => b.textContent?.trim() === '提交下注' && !b.disabled);
        if (submitBtn) {
          e.preventDefault();
          submitBtn.click();
        }
        return;
      }

      // 1/2/3 → 第 N 个 odds chip（按 DOM 顺序）
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        const n = Number(e.key) - 1;
        // 选含数字的 chip（过滤 chip 比过滤"全部"chip 准确）
        const chips = Array.from(
          document.querySelectorAll<HTMLElement>('.odds-chip:not(.disabled)'),
        ).filter((c) => /\d+\.\d+/.test(c.textContent ?? ''));
        if (chips[n]) {
          e.preventDefault();
          chips[n].click();
          // 视觉反馈：临时高亮
          chips[n].style.outline = '2px solid var(--accent)';
          chips[n].style.outlineOffset = '2px';
          window.setTimeout(() => {
            chips[n].style.outline = '';
            chips[n].style.outlineOffset = '';
          }, 800);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [helpOpen]);

  return { openHelp, closeHelp, helpOpen };
}
