import { describe, expect, it } from "vitest";
import {
  isCacheableAsset,
  isStorable,
  urlBase64ToUint8Array,
} from "./cache-policy";

const response = (
  overrides: Partial<Parameters<typeof isStorable>[0]> = {},
) => ({
  ok: true,
  redirected: false,
  type: "basic",
  url: "https://app.example.com/assets/main.js",
  ...overrides,
});

describe("isStorable", () => {
  it("stores an ordinary asset response", () => {
    expect(isStorable(response())).toBe(true);
  });

  // The bug this whole module exists to prevent: caching the Access login
  // would leave the installed app stuck on it.
  it("never stores a redirected response", () => {
    expect(isStorable(response({ redirected: true }))).toBe(false);
  });

  it("never stores an opaque redirect", () => {
    expect(isStorable(response({ type: "opaqueredirect" }))).toBe(false);
  });

  it("never stores anything served from cloudflareaccess.com", () => {
    expect(
      isStorable(
        response({
          url: "https://team.cloudflareaccess.com/cdn-cgi/access/login",
        }),
      ),
    ).toBe(false);
  });

  it("does not store failures", () => {
    expect(isStorable(response({ ok: false }))).toBe(false);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url, padding included", () => {
    // "hello" as base64url, unpadded.
    expect([...urlBase64ToUint8Array("aGVsbG8")]).toEqual([
      104, 101, 108, 108, 111,
    ]);
  });

  it("handles the url-safe alphabet", () => {
    expect([...urlBase64ToUint8Array("-_8")]).toEqual([251, 255]);
  });
});

describe("isCacheableAsset", () => {
  const origin = "https://app.example.com";
  const get = { method: "GET" };
  const cacheable = (path: string, request = get, o = origin) =>
    isCacheableAsset(new URL(path, origin), request, o);

  it("caches build assets and icons", () => {
    expect(cacheable("/assets/main-abc.js")).toBe(true);
    expect(cacheable("/apple-touch-icon.png")).toBe(true);
  });

  it("never caches server functions or the API", () => {
    expect(cacheable("/_server/x")).toBe(false);
    expect(cacheable("/api/health")).toBe(false);
  });

  it("leaves pages and cross-origin requests alone", () => {
    expect(cacheable("/moves")).toBe(false);
    expect(
      isCacheableAsset(
        new URL("https://cdn.other.com/assets/a.js"),
        get,
        origin,
      ),
    ).toBe(false);
  });

  it("only caches GETs", () => {
    expect(cacheable("/assets/main.js", { method: "POST" })).toBe(false);
  });
});
