const CACHE_NAME = 'webs-cache-v1';
const APP_SHELL_URL = '/';

const fullManifest = self.__WEBS_MANIFEST || [];

const assetUrls = fullManifest
  .filter((entry) => entry.url.includes('.'))
  .map((entry) => entry.url);

const urlsToCache = [APP_SHELL_URL, ...assetUrls];

self.addEventListener('install', (event) => {
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
  const { request } = event;

  if (request.headers.has('X-Webs-Navigate')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        console.log('[SW] Network fetch failed, serving app shell from cache.');
        return caches.match(APP_SHELL_URL);
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
