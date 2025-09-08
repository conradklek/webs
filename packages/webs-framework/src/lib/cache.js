const CACHE_NAME = 'webs-cache-v1';
const APP_SHELL_URL = '/';

const fullManifest = self.__WEBS_MANIFEST || [];

const assetUrls = fullManifest
  .filter((entry) => entry.url.includes('.'))
  .map((entry) => entry.url);

const urlsToCache = [APP_SHELL_URL, ...assetUrls];

self.addEventListener('install', (event) => {
  if (typeof IS_PROD !== 'undefined' && !IS_PROD) {
    console.log('[SW] Development mode: skipping caching on install.');
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell and assets on install.');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        );
      })
      .then(() => {
        return self.clients.claim();
      }),
  );
});

self.addEventListener('fetch', (event) => {
  if (typeof IS_PROD !== 'undefined' && !IS_PROD) {
    console.log(
      '[SW] Fetch event ignored in development mode for request:',
      event.request.url,
    );
    return;
  }

  const { request } = event;

  if (request.headers.has('X-Webs-Navigate')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'Network unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          console.log(
            '[SW] Network fetch failed, trying cache for navigation.',
          );
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match(APP_SHELL_URL);
          });
        }),
    );
    return;
  }

  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        });
      }),
    );
  }
});
