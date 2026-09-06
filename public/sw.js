// OpenSEO service worker. Plain JS, no build step.
//
// The one rule that matters here: this app sits behind Cloudflare Access, so a
// request whose response is a login redirect must NEVER be cached — cache one
// and the installed app serves the login page forever. Everything below is
// built around that.
const VERSION = "v1";
const ASSET_CACHE = `openseo-assets-${VERSION}`;
const SHELL_CACHE = `openseo-shell-${VERSION}`;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><style>
body{margin:0;display:grid;place-items:center;min-height:100vh;font:16px/1.5 -apple-system,system-ui,sans-serif;background:#0d1311;color:#e8efea;padding:2rem;text-align:center}
p{color:#7e8d86;max-width:32ch}</style></head>
<body><div><h1>Offline</h1><p>No connection. Your moves are waiting when you're back.</p></div></body></html>`;

// Keep in sync with src/custom/client/pwa/cache-policy.ts (which exists so this
// rule is unit-tested).
function isCacheableAsset(url, request) {
  if (request.method !== "GET") return false;
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/_server")) return false;
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/favicon") ||
    url.pathname.startsWith("/android-chrome") ||
    url.pathname === "/apple-touch-icon.png"
  );
}

function isStorable(response) {
  return Boolean(
    response &&
      response.ok &&
      !response.redirected &&
      response.type !== "opaqueredirect" &&
      !new URL(response.url || self.location.href).hostname.includes(
        "cloudflareaccess.com",
      ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== ASSET_CACHE && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (isStorable(response)) {
            const cache = await caches.open(SHELL_CACHE);
            void cache.put("/", response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match("/", { cacheName: SHELL_CACHE });
          return (
            cached ??
            new Response(OFFLINE_HTML, {
              headers: { "content-type": "text/html; charset=utf-8" },
              status: 503,
            })
          );
        }
      })(),
    );
    return;
  }

  if (!isCacheableAsset(url, request)) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { cacheName: ASSET_CACHE });
      if (cached) return cached;
      const response = await fetch(request);
      if (isStorable(response)) {
        const cache = await caches.open(ASSET_CACHE);
        void cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "OpenSEO", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "OpenSEO", {
      body: payload.body || "",
      data: { url: payload.url || "/" },
      tag: payload.tag || "openseo",
      icon: "/android-chrome-192x192.png",
      badge: "/favicon-32x32.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
