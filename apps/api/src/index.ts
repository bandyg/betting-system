import express from 'express';
import cors from 'cors';
import { accountsRouter } from './routes/accounts.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'betting-api', time: new Date().toISOString() });
});

app.use('/api', accountsRouter);

app.listen(PORT, () => {
  console.log(`[betting-api] listening on :${PORT}`);
});
