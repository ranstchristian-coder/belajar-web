/* === YuRa SW (frontend root) === */
const VERSION = 'yura-sw-v1.0.1';
const CORE_CACHE = `${VERSION}-core`;

/** File inti yang harus tersedia offline.
 *  Path RELATIF (tanpa leading slash) karena SW berada di /frontend.
 */
const CORE_ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  // halaman tambahan (jika ada)
  'login.html',
  'login.css',
  'login.js'
  // tambahkan file lain jika perlu, mis. 'assets/whatever.png'
];

/** Host CDN yang disarankan pakai strategi SWR */
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'cdn.skypack.dev',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => !k.startsWith(VERSION))
      .map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin → cache-first
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CORE_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        // fallback saat offline
        if (req.headers.get('accept')?.includes('text/html')) {
          return cache.match('index.html');
        }
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // CDN → stale-while-revalidate
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(`${VERSION}-cdn`);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || network || new Response('', { status: 504 });
    })());
  }
});
