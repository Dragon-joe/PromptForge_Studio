const CACHE = 'promptforge-shark-v2.4-dark';
const APP_SHELL = [
  './', './index.html', './assets/styles.css', './assets/data.js', './assets/i18n.js',
  './assets/app.js', './assets/icon-192.png', './assets/icon-512.png', './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(APP_SHELL.map(async item => {
      try { await cache.add(item); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('promptforge-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request.mode === 'navigate' ? './index.html' : request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      return (await caches.match(request)) || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
    }
  })());
});
