/**
 * @file Service worker for caching application assets and enabling offline functionality.
 * @global
 * @property {boolean} IS_PROD - A global flag indicating if the environment is production.
 * @property {Array<{url: string}>} __WEBS_MANIFEST - A global variable injected by the build process, containing the list of assets to cache.
 */

/// <reference lib="WebWorker" />

/**
 * @typedef {ServiceWorkerGlobalScope & typeof globalThis & { IS_PROD: boolean; __WEBS_MANIFEST: Array<{url: string}>}} ServiceWorkerWithCustomGlobals
 */

const sw = /** @type {ServiceWorkerWithCustomGlobals} */ (
  /** @type {unknown} */ (self)
);

const CACHE_NAME = 'webs-cache-v1';

const APP_SHELL_URL = '/';

const fullManifest = sw.__WEBS_MANIFEST || [];

const assetUrls = fullManifest
  .filter((entry) => entry.url.includes('.'))
  .map((entry) => entry.url);

const urlsToCache = [APP_SHELL_URL, ...assetUrls];

sw.addEventListener('install', (event) => {
  if (typeof sw.IS_PROD !== 'undefined' && !sw.IS_PROD) {
    console.log('[SW] Development mode: skipping caching on install.');
    return event.waitUntil(sw.skipWaiting());
  }

  console.log('[SW] Production mode: Caching app shell and assets on install.');
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching:', urlsToCache);
        return cache.addAll(urlsToCache);
      })
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker...');
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log(`[SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            }),
        );
      })
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  if (typeof sw.IS_PROD !== 'undefined' && !sw.IS_PROD) {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== sw.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const resClone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(APP_SHELL_URL, resClone));
          }
          return response;
        })
        .catch(async () => {
          console.warn(
            '[SW] Network unavailable for navigation. Serving app shell from cache.',
          );
          const cachedResponse = await caches.match(APP_SHELL_URL);
          return (
            cachedResponse ||
            new Response('App shell not found in cache', { status: 404 })
          );
        }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(request);

      const fetchedResponsePromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch((err) => {
          console.warn(`[SW] Network request for ${request.url} failed.`, err);
          return (
            cachedResponse ||
            new Response('Network error', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        });

      return cachedResponse || fetchedResponsePromise;
    }),
  );
});
