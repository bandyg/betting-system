// components/MatchDetail.tsx — 赛事详情弹窗 (Sprint 2 A2 v1: 只用现有数据, 不依赖后端 history 表)
//
// 显示: kickoff time / sport / league / status / 全部 markets (1x2/ah/ou) / 每个 market odds 列表
// "加注" 按钮复用 onPick (跟 MatchesExplorer 一致)
//
// 注意: v1 不含历史交锋/战绩/odds 历史曲线 — 这些需要后端 history 表, 留 Sprint 5 C1 图表一起做

import { useState } from 'react';
import {
  TYPE_LABELS,
  SEL_LABELS,
  MATCH_STATUS_LABELS,
  type Match,
  type Market,
  type OddsItem,
} from '@betting/core';
import { MiniChart } from './MiniChart.js';

// Mock odds history generator (Sprint 3 #A2v2)
function mockOddsHistory(basePrice: number, n = 24): number[] {
  const out: number[] = [];
  let p = basePrice * 0.97;
  for (let i = 0; i < n; i++) {
    p = p + (Math.random() - 0.48) * 0.04;
    p = Math.max(1.01, p);
    out.push(parseFloat(p.toFixed(2)));
  }
  out[out.length - 1] = basePrice;  // 确保终点等于当前价
  return out;
}

interface Props {
  match: Match | null;
  onClose: () => void;
  onPick: (m: Match, mk: Market, o: OddsItem) => void;
  loggedIn: boolean;
}

function fmtFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function impliedProb(price: number): string {
  if (price <= 1) return '—';
  return ((1 / price) * 100).toFixed(1) + '%';
}

export function MatchDetail({ match, onClose, onPick, loggedIn }: Props) {
  const [activeMarket, setActiveMarket] = useState<number | null>(null);

  if (!match) return null;

  // 选默认 market (第一个 open 的)
  const defaultMarket = match.markets.find((m) => m.status === 'open') ?? match.markets[0];
  const marketId = activeMarket ?? defaultMarket?.id ?? null;
  const market = match.markets.find((m) => m.id === marketId) ?? null;

  const handlePick = (mk: Market, o: OddsItem) => {
    if (!loggedIn) {
      // toast 在外层弹 — 这里只 trigger onPick (parent LoginBar 已 toast)
    }
    onPick(match, mk, o);
  };

  return (
    <div className="md-backdrop" onClick={onClose}>
      <div className="md-modal scale-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="赛事详情">
        {/* Header */}
        <div className="md-head">
          <div className="md-head-info">
            <div className="md-teams">
              {match.home_team} <span className="muted">vs</span> {match.away_team}
            </div>
            <div className="md-meta">
              <span className={`badge ${match.status}`}>{MATCH_STATUS_LABELS[match.status] ?? match.status}</span>
              <span className="muted">🏆 {match.sport ?? '—'}</span>
              {match.league && <span className="muted">📋 {match.league}</span>}
              <span className="muted">🕐 {fmtFull(match.kickoff_time)}</span>
              {match.home_score != null && (
                <span className="balance-inline">比分 {match.home_score} : {match.away_score}</span>
              )}
            </div>
          </div>
          <button className="ghost small" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        {/* Markets Tabs */}
        {match.markets.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            <div className="title">该赛事暂无市场</div>
          </div>
        ) : (
          <>
            <div className="md-market-tabs">
              {match.markets.map((mk) => (
                <button
                  key={mk.id}
                  className={`md-market-tab ${marketId === mk.id ? 'active' : ''}`}
                  onClick={() => setActiveMarket(mk.id)}
                  disabled={mk.status !== 'open'}
                >
                  {TYPE_LABELS[mk.type] ?? mk.type}
                  {mk.line != null && <span className="muted"> @ {mk.line}</span>}
                  {mk.status !== 'open' && <span className="muted">（已关闭）</span>}
                </button>
              ))}
            </div>

            {/* Odds Table */}
            {market && (
              <table className="md-odds">
                <thead>
                  <tr>
                    <th>选项</th>
                    <th style={{ width: 100 }}>赔率</th>
                    <th style={{ width: 100 }}>隐含概率</th>
                    <th style={{ width: 100 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {market.odds.map((o) => (
                    <tr key={`${market.id}-${o.selection}`}>
                      <td>
                        {SEL_LABELS[o.selection] ?? o.selection}
                        <div className="md-chart-wrap">
                          <MiniChart data={mockOddsHistory(o.price)} label={SEL_LABELS[o.selection] ?? o.selection} width={140} height={36} />
                        </div>
                      </td>
                      <td><strong>{o.price.toFixed(2)}</strong></td>
                      <td className="muted">{impliedProb(o.price)}</td>
                      <td>
                        <button
                          className="ghost small"
                          disabled={market.status !== 'open' || !loggedIn}
                          title={!loggedIn ? '请先登录' : market.status !== 'open' ? '已关闭' : '加入投注单'}
                          onClick={() => handlePick(market, o)}
                        >
                          {!loggedIn ? '🔒 登录' : market.status !== 'open' ? '已关闭' : '＋ 加注'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="md-hint muted">提示: 加注后, 在右侧「投注单」可统一提交</p>
          </>
        )}
      </div>
    </div>
  );
}
