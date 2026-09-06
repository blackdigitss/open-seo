// A testable copy of the two rules public/sw.js applies. The service worker
// can't import modules, so the logic is duplicated there — keep both in sync;
// these tests are what stop the Access-redirect bug from coming back.

export function isCacheableAsset(
  url: URL,
  request: { method: string },
  origin: string,
): boolean {
  if (request.method !== "GET") return false;
  if (url.origin !== origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/_server")) return false;
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/favicon") ||
    url.pathname.startsWith("/android-chrome") ||
    url.pathname === "/apple-touch-icon.png"
  );
}

export function isStorable(response: {
  ok: boolean;
  redirected: boolean;
  type: string;
  url: string;
}): boolean {
  if (!response.ok) return false;
  if (response.redirected) return false;
  if (response.type === "opaqueredirect") return false;
  try {
    if (new URL(response.url).hostname.includes("cloudflareaccess.com")) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
