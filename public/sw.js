const CACHE_PREFIX = "ridge-trail-passport-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const CORE_ASSETS = ["./", "./manifest.webmanifest", "./ridge-trail-logo.png"];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  const pageResponse = await fetch("./", { cache: "no-store" });
  if (!pageResponse.ok) throw new Error("Could not cache Passport shell");

  await cache.put("./", pageResponse.clone());

  const html = await pageResponse.text();
  const urls = new Set(CORE_ASSETS.slice(1));

  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    try {
      const url = new URL(match[1], self.registration.scope);
      if (url.origin === self.location.origin) {
        urls.add(url.href);
      }
    } catch {
      // Ignore malformed or non-URL attributes.
    }
  }

  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) await cache.put(url, response);
      } catch {
        // A nonessential shell asset should not block service-worker install.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, navigationFallback = false) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (navigationFallback) {
      const shell = await cache.match("./");
      if (shell) return shell;
    }

    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Deliberately leave ArcGIS, OpenStreetMap, attachment images, and every
  // other third-party request to the browser/network. This service worker
  // caches only the Passport's own same-origin application files.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/sw.js")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, true));
    return;
  }

  event.respondWith(networkFirst(request));
});
