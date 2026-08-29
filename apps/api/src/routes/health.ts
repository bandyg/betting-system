/**
 * GET /api/health — 健康检查端点（O1 轮，吸收 nlm 三轮审查全部修复）
 *
 * 设计要点（对应审查问题）：
 * - 配置显式开关：REDIS_ENABLED==='true' / PG_ENABLED==='true' 才探测，否则 not_configured [C1v2/M1v3]
 * - HTTP 语义：db down → 503 + degraded；web down → 200 + degraded（防部署 flapping）[C2v2]
 * - api 自身状态全内存判定，不对自身端口发 loopback [M1v2]
 * - 探针：web HTTP 200-399、db SELECT 1 (busy_timeout 500)、redis RESP+AUTH、pg StartupMessage client-first [C1v3/M2v3/m5v3]
 * - cache+singleflight：ok 3s / degraded 1s / 503 不缓存；X-Health-Bypass-Cache 穿透 [M3v3/m4v3]
 */
import { Router, type Request, type Response } from 'express';
import http from 'node:http';
import net from 'node:net';
import db from '../db/index.js';

const healthRouter = Router();

// ---------- 配置（env 显式开关） ----------
const WEB_HOST = process.env.WEB_HOST ?? '127.0.0.1';
const WEB_PORT = Number(process.env.WEB_PORT ?? 4200);
const API_PORT = Number(process.env.PORT ?? 4100);
const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true';
const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? '';
const PG_ENABLED = process.env.PG_ENABLED === 'true';
const PG_HOST = process.env.PG_HOST ?? '127.0.0.1';
const PG_PORT = Number(process.env.PG_PORT ?? 5432);

const PROBE_TIMEOUT_MS = 1000;
const CACHE_TTL_OK_MS = 3000;
const CACHE_TTL_DEGRADED_MS = 1000;
const CACHE_TTL_503_MS = 0; // db down：不缓存，避免 cluster 轮询 flapping [M3v3]

interface ProbeResult {
  status: 'ok' | 'down' | 'not_configured';
  detail?: string;
  httpStatus?: number;
  engine?: string;
  test?: string;
}

// ---------- 探针 ----------
/** web：真实 HTTP GET，200-399 视为 ok（301/302 跳转不算 down）[m5v3] */
function probeWeb(): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: WEB_HOST, port: WEB_PORT, path: '/', timeout: PROBE_TIMEOUT_MS },
      (res) => {
        res.resume(); // 丢弃 body，避免挂起
        const ok = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400;
        resolve({
          status: ok ? 'ok' : 'down',
          httpStatus: res.statusCode,
          detail: ok ? undefined : `HTTP ${res.statusCode}`,
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'down', detail: `timeout after ${PROBE_TIMEOUT_MS}ms` });
    });
    req.on('error', (err) => resolve({ status: 'down', detail: err.message }));
  });
}

/** db：better-sqlite3 真实 SELECT 1；busy_timeout 500 防 WAL 锁长时间阻塞主线程 [M2v3] */
function probeDb(): ProbeResult {
  try {
    db.pragma('busy_timeout = 500');
    const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    return { status: row?.ok === 1 ? 'ok' : 'down', engine: 'sqlite', test: 'SELECT 1', detail: row?.ok === 1 ? undefined : 'SELECT 1 返回异常' };
  } catch (err) {
    return { status: 'down', engine: 'sqlite', test: 'SELECT 1', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** redis：RESP 行解析 + 可选 AUTH + PING；chunk buffer 处理 TCP 分包 [M4v2/m5v3] */
function probeRedis(): Promise<ProbeResult> {
  if (!REDIS_ENABLED) {
    return Promise.resolve({ status: 'not_configured', detail: 'not enabled (set REDIS_ENABLED=true / REDIS_HOST)' });
  }
  return new Promise((resolve) => {
    const sock = net.connect(REDIS_PORT, REDIS_HOST);
    let buf = '';
    let step: 'auth' | 'ping' | 'done' = REDIS_PASSWORD ? 'auth' : 'ping';
    const finish = (r: ProbeResult) => { sock.destroy(); resolve(r); };

    sock.setTimeout(PROBE_TIMEOUT_MS);
    sock.on('connect', () => {
      if (step === 'auth') sock.write(`AUTH ${REDIS_PASSWORD}\r\n`);
      else sock.write('PING\r\n');
    });
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\r\n');
      if (nl === -1) return; // 分包未完整，继续累积
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      if (step === 'auth') {
        if (line.startsWith('+OK')) { step = 'ping'; sock.write('PING\r\n'); }
        else if (line.startsWith('-')) { finish({ status: 'down', detail: `AUTH ${line}` }); step = 'done'; }
      } else if (step === 'ping') {
        if (line.startsWith('+PONG')) finish({ status: 'ok' });
        else finish({ status: 'down', detail: `PING ${line}` });
        step = 'done';
      }
    });
    sock.on('timeout', () => finish({ status: 'down', detail: `timeout after ${PROBE_TIMEOUT_MS}ms` }));
    sock.on('error', (err) => finish({ status: 'down', detail: err.message }));
  });
}

/** postgres：client-first，发送最小 StartupMessage(3.0) 后读 R(认证请求)/E(错误响应) 即视为可达 [C1v3] */
function probePg(): Promise<ProbeResult> {
  if (!PG_ENABLED) {
    return Promise.resolve({ status: 'not_configured', detail: 'not enabled (set PG_ENABLED=true / PG_HOST)' });
  }
  return new Promise((resolve) => {
    const sock = net.connect(PG_PORT, PG_HOST);
    let got = false;
    const finish = (r: ProbeResult) => { got = true; sock.destroy(); resolve(r); };

    sock.setTimeout(PROBE_TIMEOUT_MS);
    sock.on('connect', () => {
      // StartupMessage: int32 length + int32 protocol(196608=3.0) + "user\0postgres\0\0"
      const params = Buffer.from('user\0postgres\0\0', 'utf8');
      const msg = Buffer.alloc(4 + 4 + params.length);
      msg.writeInt32BE(4 + 4 + params.length, 0);
      msg.writeInt32BE(196608, 4);
      params.copy(msg, 8);
      sock.write(msg);
    });
    sock.on('data', (chunk) => {
      if (got) return;
      const t = chunk[0];
      if (t === 0x52 /* 'R' Authentication */) finish({ status: 'ok', detail: 'startup handshake ok' });
      else if (t === 0x45 /* 'E' ErrorResponse */) finish({ status: 'ok', detail: 'server responded (auth error expected for probe)' });
      else finish({ status: 'down', detail: `unexpected byte 0x${t.toString(16)}` });
    });
    sock.on('timeout', () => finish({ status: 'down', detail: `timeout after ${PROBE_TIMEOUT_MS}ms (no startup response)` }));
    sock.on('error', (err) => finish({ status: 'down', detail: err.message }));
  });
}

// ---------- 聚合 ----------
interface HealthResult {
  status: 'ok' | 'degraded';
  service: string;
  uptime: number;
  time: string;
  cache: 'fresh' | 'cached';
  httpStatus: number; // 内部字段，响应时剥离
  services: Record<string, ProbeResult & { port: number }>;
}

async function runProbes(): Promise<HealthResult> {
  const settled = await Promise.allSettled([probeWeb(), probeRedis(), probePg()]); // 单探针崩溃不影响整体 [m4v3]
  const web = settled[0].status === 'fulfilled' ? settled[0].value : { status: 'down' as const, detail: 'probe crashed' };
  const redis = settled[1].status === 'fulfilled' ? settled[1].value : { status: 'down' as const, detail: 'probe crashed' };
  const pg = settled[2].status === 'fulfilled' ? settled[2].value : { status: 'down' as const, detail: 'probe crashed' };
  const dbRes = probeDb();

  const core = { web: web.status === 'ok', api: true, db: dbRes.status === 'ok' };
  const degraded = !core.web || !core.api || !core.db;
  // 503 仅在核心存储 db down 时（readiness）；web down 仍 200（防部署 flapping）[C2v2]
  const httpStatus = dbRes.status === 'ok' ? 200 : 503;

  return {
    status: degraded ? 'degraded' : 'ok',
    service: 'betting-api',
    uptime: Math.round(process.uptime() * 100) / 100,
    time: new Date().toISOString(),
    cache: 'fresh',
    httpStatus,
    services: {
      web: { ...web, port: WEB_PORT },
      api: { status: 'ok', port: API_PORT, detail: 'in-process' }, // 自身不 loopback [M1v2]
      db: { ...dbRes, port: 0 },
      redis: { ...redis, port: REDIS_PORT },
      postgres: { ...pg, port: PG_PORT },
    },
  };
}

// ---------- cache + singleflight ----------
let cache: { result: HealthResult; expiresAt: number } | null = null;
let inFlight: Promise<HealthResult> | null = null;

async function getHealth(bypass: boolean): Promise<HealthResult> {
  const now = Date.now();
  if (!bypass && cache && cache.expiresAt > now) {
    return { ...cache.result, cache: 'cached' };
  }
  if (inFlight) return inFlight; // singleflight：并发共享同一探测 [M2v2/m4v3]
  inFlight = (async () => {
    try {
      const result = await runProbes();
      const ttl = result.httpStatus === 503 ? CACHE_TTL_503_MS
        : result.status === 'ok' ? CACHE_TTL_OK_MS : CACHE_TTL_DEGRADED_MS;
      if (ttl > 0) cache = { result, expiresAt: Date.now() + ttl };
      else cache = null; // 503 不缓存 [M3v3]
      return result;
    } finally {
      inFlight = null; // 异常也保证释放 [m4v3]
    }
  })();
  return inFlight;
}

// ---------- 路由 ----------
healthRouter.get('/health', async (req: Request, res: Response) => {
  const bypass = req.headers['x-health-bypass-cache'] === 'true';
  try {
    const result = await getHealth(bypass);
    const { httpStatus, ...body } = result;
    res.status(httpStatus).json(body);
  } catch (err) {
    res.status(500).json({ status: 'error', detail: err instanceof Error ? err.message : String(err) });
  }
});

export { healthRouter, getHealth, runProbes }; // 供测试脚本模拟探测结果