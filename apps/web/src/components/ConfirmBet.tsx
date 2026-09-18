// components/ConfirmBet.tsx — 下注确认弹窗 (Sprint 2 #4)
// 显示: 模式 + 注数明细 + 总投注 + 潜在派彩 + 取消/确认 按钮
import { useState, useEffect } from 'react';
import { SEL_LABELS, TYPE_LABELS } from '@betting/core';
import type { Market } from '@betting/core';

export interface ConfirmItem {
  marketId: number;
  matchLabel: string;
  marketLabel: string;
  marketType?: string;       // 1x2 / ah / ou
  marketLine?: number | null;
  selection: string;
  price: number;
  stake: number;             // 此注金额
}

interface Props {
  open: boolean;
  mode: 'single' | 'parlay';
  items: ConfirmItem[];
  totalStake: number;
  totalPotential: number;
  combinedPrice?: number;     // parlay 时
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmBet({ open, mode, items, totalStake, totalPotential, combinedPrice, onConfirm, onCancel }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(8);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(8);
    const t = window.setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (open && secondsLeft === 0) {
      onConfirm();  // 8s 自动确认
    }
  }, [open, secondsLeft, onConfirm]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-modal scale-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="确认下注">
        <div className="confirm-head">
          <h2>🧾 确认下注</h2>
          <button className="ghost small" onClick={onCancel} aria-label="取消">✕</button>
        </div>

        <div className="confirm-mode">
          <span className={`mode-badge ${mode}`}>{mode === 'parlay' ? '🔗 组合' : '单注'}</span>
          {mode === 'parlay' && combinedPrice != null && (
            <span className="combined-price">组合赔率 ×<strong>{combinedPrice.toFixed(2)}</strong></span>
          )}
        </div>

        <table className="confirm-items">
          <thead>
            <tr>
              <th>赛事</th>
              <th>市场</th>
              <th>选择</th>
              <th>赔率</th>
              <th style={{ textAlign: 'right' }}>投注</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={`${it.marketId}-${it.selection}-${i}`}>
                <td className="match-cell">
                  <span className="match-name">{it.matchLabel}</span>
                </td>
                <td>
                  <span className="muted">{it.marketLabel}</span>
                  {it.marketLine != null && <span className="muted"> @{it.marketLine}</span>}
                </td>
                <td><strong>{SEL_LABELS[it.selection] ?? it.selection}</strong></td>
                <td><span className="price">@{it.price.toFixed(2)}</span></td>
                <td style={{ textAlign: 'right' }}><strong>¥{it.stake.toFixed(2)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="confirm-summary">
          <div className="row">
            <span className="muted">注数</span>
            <strong>{items.length}</strong>
          </div>
          <div className="row">
            <span className="muted">总投注</span>
            <strong>¥{totalStake.toFixed(2)}</strong>
          </div>
          <div className="row confirm-win">
            <span>可赢 {mode === 'parlay' ? '(全部命中)' : ''}</span>
            <strong>¥{totalPotential.toFixed(2)}</strong>
          </div>
        </div>

        <div className="confirm-actions">
          <button onClick={onCancel} className="ghost" style={{ flex: 1 }}>取消</button>
          <button onClick={onConfirm} className="primary" style={{ flex: 2 }}>
            ✓ 确认下注 {secondsLeft > 0 && `(${secondsLeft}s)`}
          </button>
        </div>
        <p className="confirm-hint muted">按 ESC 取消 · 8 秒后自动确认</p>
      </div>
    </div>
  );
}