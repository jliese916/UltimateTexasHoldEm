"use strict";

const BUILD_VERSION = "7";
const CACHE = "casa-ultimate-holdem-v7";
const ASSETS = [
  "./index.html",
  "./styles.css?v=7",
  "./poker-engine.js?v=7",
  "./strategy-data.js?v=7",
  "./app.js?v=7",
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
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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

function cacheResponse(request, response, cacheKey = request) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE).then(cache => cache.put(cacheKey, copy)).catch(() => {});
  return response;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(caches.match("./index.html").then(cached => {
      const network = fetch(event.request).then(response => cacheResponse(event.request, response, "./index.html")).catch(() => null);
      return cached || network;
    }));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => cacheResponse(event.request, response)).catch(() => cached)));
});
