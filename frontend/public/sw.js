const CACHE_NAME = "nexus-cache-v1";

const PRECACHE_ASSETS = [
  "/login",
  "/favicon.ico",
  "/manifest.json",
  "/icon.svg",
  "/apple-touch-icon.png",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/icon-maskable.png",
];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Pre-caching static assets");
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log("[SW] Clearing old cache:", cache);
              return caches.delete(cache);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event Handler
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Intercept only GET requests for HTTP/HTTPS protocols
  if (event.request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // CRITICAL: Do not intercept or cache backend API calls (security & privacy boundary)
  if (url.pathname.includes("/api/")) {
    return;
  }

  // Define strategy:
  // For static assets (JS, CSS, images, web manifest, fonts), use Cache-First.
  // For document/page navigation or other routes, use Network-First with cache fallback.
  const isStaticAsset =
    url.pathname.includes("/_next/static/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.includes("/manifest.json");

  if (isStaticAsset) {
    // Cache-First Strategy
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            const cachePromise = caches.open(CACHE_NAME).then((cache) => {
              return cache.put(event.request, responseToCache);
            });
            if (event.waitUntil) {
              event.waitUntil(cachePromise);
            }
            return networkResponse;
          })
          .catch(() => {
            return new Response("Offline", { status: 503, statusText: "Offline" });
          });
      })
    );
  } else {
    // Network-First with Cache Fallback Strategy
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Cache the successful network response
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            const cachePromise = caches.open(CACHE_NAME).then((cache) => {
              return cache.put(event.request, responseToCache);
            });
            if (event.waitUntil) {
              event.waitUntil(cachePromise);
            }
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If it's a navigation request and no cache matched, fallback to cached login page
            if (event.request.mode === "navigate") {
              return caches.match("/login").then((fallback) => {
                return fallback || new Response("Offline", { status: 503, statusText: "Offline" });
              });
            }
            return new Response("Offline", { status: 503, statusText: "Offline" });
          });
        })
    );
  }
});
