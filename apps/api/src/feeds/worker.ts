// worker.ts (P2) — standalone pm2 feed worker entry.
// Run:  node --import tsx src/feeds/worker.ts   (or built: node dist/feeds/worker.js)
import db from '../db/index.js';
import { readFeedConfig, startFeedScheduler } from './scheduler.js';

const cfg = readFeedConfig();
startFeedScheduler(db, cfg);

// keep process alive (scheduler holds timers when enabled)
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
