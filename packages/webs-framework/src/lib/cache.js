const CACHE_NAME = 'webs-cache-v1';

const fullManifest = self.__WEBS_MANIFEST || [];

const assetManifest = fullManifest.filter((entry) => entry.url.includes('.'));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(assetManifest.map((entry) => entry.url));
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
        const oldCachesPromise = Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              return caches.delete(name);
            }),
        );

        const currentCachePromise = caches
          .open(CACHE_NAME)
          .then(async (cache) => {
            const urlsToKeep = new Set(
              assetManifest.map(
                (entry) => new URL(entry.url, self.location.origin).href,
              ),
            );

            return cache.keys().then((requests) => {
              const requestsToDelete = requests.filter(
                (request) => !urlsToKeep.has(request.url),
              );

              return Promise.all(
                requestsToDelete.map((request) => cache.delete(request)),
              );
            });
          });

        return Promise.all([oldCachesPromise, currentCachePromise]);
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
      fetch(request)
        .then((networkResponse) => {
          const responseToCache = networkResponse.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, responseToCache));
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request);
        }),
    );
    return;
  }

  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then((response) => {
        if (response) {
          return response;
        }

        return fetch(request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === 'basic'
            ) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            return new Response('Fetch failed', {
              status: 503,
              statusText: 'Service Unavailable',
            });
          });
      }),
    );
  }
});
