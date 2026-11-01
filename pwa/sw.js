/* global self, caches, fetch, URL, Request, Response */
/**
 * The site's service worker: it keeps a copy of the app on the device, so the app opens and works on a
 * building site with no connection.
 *
 * Written into the build by pwa/plugin.ts, which fills in the list of files and a version. The work
 * itself is not here — the app keeps it on the device and sends it when the connection returns.
 *
 * - The app's files are copied at install, all of them, so a screen never opened before still opens
 *   offline. Hashed files never change, so they are served from the copy.
 * - A page is asked of the network first and comes from the copy only without one, so a new version
 *   is picked up whenever there is a connection.
 * - /api/ is never touched: an account's data is the server's to answer, never a stale copy.
 * - A new version waits until the page agrees to switch, so an open page never mixes two versions.
 */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `buildable-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('buildable-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'switch-version') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match(url.pathname, { ignoreSearch: true })) ??
          // /privacy is served from privacy.html.
          (await caches.match(`${url.pathname}.html`)) ??
          (await caches.match('/index.html')) ??
          Response.error(),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          // Anything else the app asks for later is kept too, once it has been fetched.
          if (res.ok && url.pathname.startsWith('/assets/')) {
            const copy = res.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
