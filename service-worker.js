"use strict";

const BUILD_VERSION = "22";
const CACHE = "casa-ultimate-holdem-v22";
const ASSETS = [
  "./index.html",
  "./styles.css?v=22",
  "./poker-engine.js?v=22",
  "./strategy-data.js?v=22",
  "./app.js?v=22",
  "./manifest.webmanifest",
  "./jefe-crest.svg",
  "./favicon-64.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "GET_VERSION") {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage({ version: BUILD_VERSION });
    return;
  }
  if (data.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request, cacheKey = request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "./index.html"));
    return;
  }

  const url = new URL(event.request.url);
  const isCoreAsset = url.origin === self.location.origin &&
    /\.(?:js|css)$/.test(url.pathname);

  if (isCoreAsset) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(async response => {
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, response.clone()).catch(() => {});
        }
        return response;
      })
    )
  );
});
