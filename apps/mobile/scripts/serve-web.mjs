// Expo Web 静态托管 + /api 反向代理
// 用法: node serve-web.mjs [port]  (默认 4300)
// 静态文件: apps/mobile/dist（expo export -p web 产物）
// /api/*  →  http://localhost:4100/api/*
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || process.env.PORT || 4300);
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const API_TARGET = process.env.API_TARGET || 'http://localhost:4100';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function serveStatic(req, res, pathname) {
  // SPA fallback：无扩展名路径回退 index.html（Expo 静态路由实际是 .html 文件，双保险）
  let file = join(DIST, normalize(pathname).replace(/^\/+/, ''));
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, 'index.html');
  }
  const ext = extname(file);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

function proxyApi(req, res) {
  const target = new URL(API_TARGET);
  const path = req.url; // 保留 /api 前缀
  const proxyReq = http.request(
    {
      host: target.hostname,
      port: target.port,
      path,
      method: req.method,
      headers: { ...req.headers, host: target.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `proxy error: ${e.message}` }));
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (pathname.startsWith('/api/')) return proxyApi(req, res);
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`[serve-web] Expo Web on http://localhost:${PORT} (dist=${DIST}, api→${API_TARGET})`);
});
