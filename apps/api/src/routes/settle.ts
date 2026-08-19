import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireRole } from './middleware.js';
import { settleMatch } from '../feeds/settle.js';

export const settleRouter = Router();

type MatchRow = {
  id: number;
  home_team: string;
  away_team: string;
  status: 'scheduled' | 'finished' | 'settled';
  home_score: number | null;
  away_score: number | null;
};

// POST /matches/:id/result — record final score, mark match finished（仅 admin）
// body: { homeScore, awayScore }
settleRouter.post('/matches/:id/result', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid match id' });
  }
  const homeScore = Number(req.body?.homeScore);
  const awayScore = Number(req.body?.awayScore);
  if (!Number.isInteger(homeScore) || homeScore < 0) {
    return res.status(400).json({ error: 'homeScore must be a non-negative integer' });
  }
  if (!Number.isInteger(awayScore) || awayScore < 0) {
    return res.status(400).json({ error: 'awayScore must be a non-negative integer' });
  }

  const match = db.prepare('SELECT id, status FROM matches WHERE id = ?').get(id) as
    | { id: number; status: string }
    | undefined;
  if (!match) {
    return res.status(404).json({ error: 'match not found' });
  }
  if (match.status === 'settled') {
    return res.status(409).json({ error: 'match already settled, result cannot be changed' });
  }

  db.prepare(
    `UPDATE matches SET home_score = ?, away_score = ?, status = 'finished' WHERE id = ?`,
  ).run(homeScore, awayScore, id);

  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  res.json({ match: updated });
});

// POST /matches/:id/settle — batch-settle all open markets of a finished match（仅 admin）
//   winners get payout (balance += stake * price), losers get nothing, pushes get stake refund (void).
//   All bets/markets/match move to settled inside one transaction. Idempotent (skips if already settled).
settleRouter.post('/matches/:id/settle', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid match id' });
  }

  const result = settleMatch(db, id);
  if (result.status === 'skipped') {
    if (result.reason === 'not_found') {
      return res.status(404).json({ error: 'match not found' });
    }
    if (result.reason === 'no_score') {
      return res
        .status(400)
        .json({ error: 'match result not recorded yet — POST /matches/:id/result first' });
    }
    return res.status(409).json({ error: 'match already settled' });
  }

  const matchAfter = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  res.json({
    match: matchAfter,
    summary: result.summary,
    parlaySummary: result.parlaySummary,
    totalPayout: result.totalPayout,
    totalRefund: result.totalRefund,
  });
});
