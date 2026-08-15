import express from 'express';
import cors from 'cors';
import { accountsRouter } from './routes/accounts.js';
import { matchesRouter } from './routes/matches.js';
import { marketsRouter } from './routes/markets.js';
import { betsRouter } from './routes/bets.js';
import { settleRouter } from './routes/settle.js';
import { cmsRouter } from './routes/cms.js';
import { crmRouter } from './routes/crm.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'betting-api', time: new Date().toISOString() });
});

app.use('/api', accountsRouter);
app.use('/api', matchesRouter);
app.use('/api', marketsRouter);
app.use('/api', betsRouter);
app.use('/api', settleRouter);
app.use('/api', cmsRouter);
app.use('/api', crmRouter);

app.listen(PORT, () => {
  console.log(`[betting-api] listening on :${PORT}`);
});
