// Offline support: the app shell is cached on install and served cache-first;
// a fresh copy is fetched in the background so the next start is up to date.
// Bump VERSION when files are added or removed.
const VERSION = 'lifestone-1.0.1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/game.js', 'js/store.js', 'js/ui.js', 'js/scan.js', 'js/chart.js', 'js/share.js', 'js/demo.js',
  'vendor/jsQR.js', 'fonts/montserrat-latin.woff2', 'fonts/boldonse-latin.woff2',
  'icons/stone.png', 'icons/favicon.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const key = url.pathname.endsWith('/') ? './' : e.request;
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
