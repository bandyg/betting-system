import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { accountsRouter } from './routes/accounts.js';
import { authRouter } from './routes/auth.js';
import { matchesRouter } from './routes/matches.js';
import { marketsRouter } from './routes/markets.js';
import { betsRouter } from './routes/bets.js';
import { settleRouter } from './routes/settle.js';
import { cmsRouter } from './routes/cms.js';
import { crmRouter } from './routes/crm.js';
import { riskRouter } from './routes/risk.js';
import { paymentsRouter } from './routes/payments.js';
import { withdrawalsRouter } from './routes/withdrawals.js';
import { analyticsRouter } from './routes/analytics.js';
import { feedRouter } from './routes/feed.js';
import { supportRouter } from './routes/support.js';
import { sportsRouter } from './routes/sports.js';
import { healthRouter } from './routes/health.js';
import { attachWsHub } from './wsHub.js';

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json());

// 安全响应头（N 轮生产化第一阶·N3）：全局应用，/health 与 /api/* 均携带
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-XSS-Protection', '0'); // 现代标准建议显式关闭遗留易误伤过滤器
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'betting-api', time: new Date().toISOString() });
});

app.use('/api', accountsRouter);
app.use('/api', authRouter);
app.use('/api', matchesRouter);
app.use('/api', marketsRouter);
app.use('/api', betsRouter);
app.use('/api', settleRouter);
app.use('/api', cmsRouter);
app.use('/api', crmRouter);
app.use('/api', riskRouter);
app.use('/api', paymentsRouter);
app.use('/api', withdrawalsRouter);
app.use('/api', analyticsRouter);
app.use('/api', feedRouter);
app.use('/api', supportRouter);
app.use('/api', sportsRouter);
app.use('/api', healthRouter);

attachWsHub(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[betting-api] listening on :${PORT} (ws: /ws/odds)`);
});
