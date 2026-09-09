const VERSION = "clashe-pwa-v8";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const IMAGE_CACHE = `${VERSION}-images`;

const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./search.html",
  "./notifications.html",
  "./profile.html",
  "./settings.html",
  "./take.html",
  "./css/variables.css",
  "./css/base.css",
  "./css/loader.css",
  "./css/layout.css",
  "./css/feed.css",
  "./css/search.css",
  "./css/profile.css",
  "./css/notifications.css",
  "./css/settings.css",
  "./css/comments-modal.css",
  "./css/share-modal.css",
  "./css/responsive.css",
  "./js/theme.js",
  "./js/loader.js",
  "./js/cache-service.js",
  "./js/prefetch.js",
  "./js/app.js",
  "./js/utils.js",
  "./js/session.js",
  "./js/pages/home.js",
  "./js/pages/search.js",
  "./js/pages/profile.js",
  "./js/pages/notifications.js",
  "./js/pages/settings.js",
  "./manifest.json",
  "./manifest.webmanifest",
  "./assets/clashly-favicon.svg",
  "./assets/pwa-192.png",
  "./assets/pwa-512.png"
];

async function warmAppShell(cache) {
  const requests = APP_SHELL_ASSETS.map((asset) =>
    fetch(asset, { cache: "no-cache" })
      .then((response) => {
        if (!response || !response.ok) {
          throw new Error(`Failed to precache ${asset}`);
        }
        return cache.put(asset, response);
      })
      .catch((error) => {
        console.warn("[Clashe SW] Precache skipped:", asset, error);
      })
  );

  await Promise.all(requests);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => warmAppShell(cache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== STATIC_CACHE && key !== PAGE_CACHE) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw _error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

function isCacheableResponse(response) {
  return Boolean(response) && (response.ok || response.type === "opaque");
}

function isRemoteStaticAsset(request, url) {
  if (!request || !url) return false;
  const destination = request.destination || "";
  const host = url.hostname || "";
  return (
    ["script", "style", "font"].includes(destination) &&
    (host === "cdn.jsdelivr.net" || host === "fonts.googleapis.com" || host === "fonts.gstatic.com")
  );
}

function isSupabaseStorageImageRequest(request, url) {
  if (!request || !url) return false;
  if ((request.destination || "") !== "image") return false;
  return url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/public/");
}

async function staleWhileRevalidatePage(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (isCacheableResponse(response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(async () => {
      if (cached) return cached;
      if (fallbackUrl) {
        return caches.match(fallbackUrl);
      }
      return null;
    });

  return cached || fetchPromise;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate" && isSameOrigin) {
    event.respondWith(staleWhileRevalidatePage(request, PAGE_CACHE, "./index.html"));
    return;
  }

  if (isSameOrigin && /\.(?:css|js|png|jpg|jpeg|svg|webp|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (isSupabaseStorageImageRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  if (isRemoteStaticAsset(request, url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});
