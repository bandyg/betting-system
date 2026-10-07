// Expo Web 静态托管 + /api 反向代理 + /ws WebSocket 反向代理
// 用法: node serve-web.mjs [port]  (默认 4300)
// 静态文件: apps/mobile/dist（expo export -p web 产物）
// /api/*  →  http://localhost:4100/api/*
// /ws/*   →  http://localhost:4100/ws/*（upgrade 管道转发，不解析帧）
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
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
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

/** WebSocket 升级反代：双向管道转发 socket 字节，不做帧解析 */
function proxyWsUpgrade(req, socket, head) {
  const target = new URL(API_TARGET);
  const key = req.headers['sec-websocket-key'];
  const headers = { ...req.headers, host: target.host };
  // Node 的 http.request 不会自动带上升级头，手动补齐
  if (key) headers['sec-websocket-key'] = key;
  const proxyReq = http.request({
    host: target.hostname,
    port: target.port,
    path: req.url,
    method: req.method,
    headers,
  });
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const headBuf = proxyHead && proxyHead.length ? proxyHead : null;
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n'
    );
    if (headBuf) socket.write(headBuf);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    const kill = () => {
      proxySocket.destroy();
      socket.destroy();
    };
    proxySocket.on('error', kill);
    socket.on('error', kill);
    proxySocket.on('close', () => socket.destroy());
    socket.on('close', () => proxySocket.destroy());
  });
  proxyReq.on('error', (e) => {
    socket.write(`HTTP/1.1 502 Bad Gateway\r\nx-proxy-error: ${e.message}\r\n\r\n`);
    socket.destroy();
  });
  if (head && head.length) proxyReq.write(head);
  proxyReq.end();
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (pathname.startsWith('/api/')) return proxyApi(req, res);
  return serveStatic(req, res, pathname);
});

// WebSocket：/ws/* 升级请求转发到 API_TARGET
server.on('upgrade', (req, socket, head) => {
  const pathname = (req.url || '').split('?')[0];
  if (pathname.startsWith('/ws/')) return proxyWsUpgrade(req, socket, head);
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`[serve-web] Expo Web on http://localhost:${PORT} (dist=${DIST}, api→${API_TARGET})`);
});
