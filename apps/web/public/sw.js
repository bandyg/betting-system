// public/sw.js — Service Worker for PWA (Sprint 4 B5)
//
// 缓存策略:
// - install: 预缓存关键静态资源 (index.html, manifest)
// - fetch:
//   - 同源 GET: cache-first, fallback network
//   - API 请求: network-only (不缓存, 保持数据新鲜)
//   - 其他: network-first, fallback cache
// - activate: 清理旧缓存

const CACHE_VERSION = 'betting-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => !n.startsWith(CACHE_VERSION)).map((n) => caches.delete(n)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API: 不缓存, 走网络
  if (url.pathname.startsWith('/api/')) {
    return;  // 让浏览器正常处理 (网络)
  }

  // 同源 GET: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          // 只缓存成功响应
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        }).catch(() => {
          // 网络失败 fallback index.html (SPA)
          return caches.match('/index.html');
        });
      }),
    );
  }
});