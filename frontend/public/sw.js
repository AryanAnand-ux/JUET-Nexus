const CACHE_NAME = "nexus-cache-v2";

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
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames.map((cache) => (cache !== CACHE_NAME ? caches.delete(cache) : undefined))
        )
      ),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable().catch(() => undefined)
        : Promise.resolve(),
    ]).then(() => self.clients.claim())
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
  if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
    return;
  }

  // Cache-First for immutable/hashed static assets
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
    return;
  }

  // For document navigations: do not store authenticated/mutable Next.js HTML shells
  // in Cache Storage (prevents stale HTML referencing deleted chunk hashes after deploys).
  // Use Navigation Preload when available and fall back cleanly when offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      Promise.resolve(event.preloadResponse)
        .then((preloaded) => preloaded || fetch(event.request))
        .catch(() =>
          caches.match("/login").then(
            (fallback) => fallback || new Response("Offline", { status: 503, statusText: "Offline" })
          )
        )
    );
  }
});

// Push Event Handler
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || "JUET Nexus Update";
    const options = {
      body: data.body || "Your academic dashboard has been updated.",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      vibrate: [100, 50, 100],
      data: { url: data.url || "/dashboard" },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("[SW] Failed to parse push data:", err);
  }
});

// Notification Click Event Handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If a window is already open at /dashboard, focus it
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url.includes("/dashboard") && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
