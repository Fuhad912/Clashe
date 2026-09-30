const VERSION = "clashe-pwa-v24";
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
  "./css/icons.css",
  "./assets/vendor/fontawesome-6.7.2/css/brands.min.css",
  "./assets/vendor/fontawesome-6.7.2/css/fontawesome.min.css",
  "./assets/vendor/fontawesome-6.7.2/css/regular.min.css",
  "./assets/vendor/fontawesome-6.7.2/css/solid.min.css",
  "./assets/vendor/fontawesome-6.7.2/webfonts/fa-brands-400.ttf",
  "./assets/vendor/fontawesome-6.7.2/webfonts/fa-brands-400.woff2",
  "./assets/vendor/fontawesome-6.7.2/webfonts/fa-regular-400.ttf",
  "./assets/vendor/fontawesome-6.7.2/webfonts/fa-regular-400.woff2",
  "./assets/vendor/fontawesome-6.7.2/webfonts/fa-solid-900.ttf",
  "./assets/vendor/fontawesome-6.7.2/webfonts/fa-solid-900.woff2",
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
  "./js/clashscore-tiers.js",
  "./js/app.js",
  "./js/push-service.js",
  "./js/utils.js",
  "./js/session.js",
  "./js/pages/home.js",
  "./js/pages/search.js",
  "./js/pages/profile.js",
  "./js/pages/notifications.js",
  "./js/pages/settings.js",
  "./manifest.json",
  "./manifest.webmanifest",
  "./assets/Lightmode_logo.svg",
  "./assets/Darkmode_logo.svg",
  "./assets/Lightmode_favicon.svg",
  "./assets/Darkmode_favicon.svg",
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
    const response = await fetch(request, { cache: "no-cache" });
    if (isCacheableResponse(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const precached = await caches.match(request);
    if (precached) return precached;
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

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate" && isSameOrigin) {
    const isHome = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    event.respondWith(networkFirst(request, PAGE_CACHE, isHome ? "./index.html" : null));
    return;
  }

  if (isSameOrigin && /\.(?:css|js|woff2?|ttf|png|jpg|jpeg|svg|webp|webmanifest)$/i.test(url.pathname)) {
    const isCode = /\.(?:css|js)$/i.test(url.pathname);
    event.respondWith(isCode ? networkFirst(request, STATIC_CACHE) : staleWhileRevalidate(request, STATIC_CACHE));
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

self.addEventListener("push", (event) => {
  let message = {};
  try {
    const parsed = event.data ? event.data.json() : {};
    if (parsed && typeof parsed === "object") message = parsed;
  } catch (_) {}
  const title = typeof message.title === "string" ? message.title.slice(0, 80) : "Clashe";
  const body = typeof message.body === "string" ? message.body.slice(0, 180) : "You have a new notification.";
  let url = new URL("./notifications.html", self.location.href);
  try {
    const candidate = new URL(message.url || "./notifications.html", self.registration.scope);
    if (candidate.origin === self.location.origin && candidate.href.startsWith(self.registration.scope)) url = candidate;
  } catch (_) {}
  event.waitUntil((async () => {
    // Web Push subscriptions promise a visible notification for every push.
    await self.registration.showNotification(title, {
      body,
      icon: new URL("./assets/pwa-192.png", self.registration.scope).href,
      badge: new URL("./assets/pwa-192.png", self.registration.scope).href,
      tag: message.id ? `clashe-${String(message.id).slice(0, 100)}` : "clashe-notification",
      data: { url: url.href },
    });
    if (typeof self.registration.setAppBadge === "function") {
      await self.registration.setAppBadge(1).catch(() => {});
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const fallback = new URL("./notifications.html", self.registration.scope);
    let target = fallback;
    try {
      const candidate = new URL(event.notification.data?.url || fallback.href, self.registration.scope);
      if (candidate.origin === self.location.origin && candidate.href.startsWith(self.registration.scope)) target = candidate;
    } catch (_) {}
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const current = windows.find((client) => client.url === target.href) || windows.find((client) => client.url.startsWith(self.registration.scope));
    if (current) {
      try {
        if (current.url !== target.href && typeof current.navigate === "function") await current.navigate(target.href);
        await current.focus();
      } catch (_) {
        await self.clients.openWindow(target.href);
      }
    } else {
      await self.clients.openWindow(target.href);
    }
    if (typeof self.registration.clearAppBadge === "function") {
      await self.registration.clearAppBadge().catch(() => {});
    }
  })());
});
