// Swapsmith service worker: makes the app installable and lets the shell open offline.
// Only same-origin GETs are handled. Scryfall calls pass straight through; src/scryfall/client.ts
// already caches them in IndexedDB. Bump VERSION to drop old caches.
const VERSION = 'v1';
const CACHE = `swapsmith-shell-${VERSION}`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('swapsmith-shell-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages: network first so a deploy shows up on the next load; cached copy when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(new URL('./', self.registration.scope).href, copy));
          return res;
        })
        .catch(async () => (await caches.match(new URL('./', self.registration.scope).href)) ?? Response.error()),
    );
    return;
  }

  // Built assets (hashed filenames) and icons: serve cached, refresh in the background.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const refresh = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => undefined);
      return cached ?? (await refresh) ?? Response.error();
    }),
  );
});
