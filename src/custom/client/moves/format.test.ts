import { describe, expect, it } from "vitest";
import { hostOf, pathOf, relativeTime } from "./format";

describe("pathOf", () => {
  it("keeps the path and query", () => {
    expect(pathOf("https://example.com/a/b?c=1")).toBe("/a/b?c=1");
  });

  it("returns the input when it isn't a URL", () => {
    expect(pathOf("/already-a-path")).toBe("/already-a-path");
  });

  it("is blank for nothing", () => {
    expect(pathOf(null)).toBe("");
  });
});

describe("hostOf", () => {
  it("pulls the host out", () => {
    expect(hostOf("https://www.example.com/page")).toBe("www.example.com");
  });

  it("copes with a bare domain", () => {
    expect(hostOf("example.com/page")).toBe("example.com");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");

  it("reads in minutes and hours", () => {
    expect(relativeTime("2026-09-05T11:30:00.000Z", now)).toBe("30m ago");
    expect(relativeTime("2026-09-05T09:00:00.000Z", now)).toBe("3h ago");
  });

  it("falls back to a date beyond a week", () => {
    expect(relativeTime("2026-08-20T12:00:00.000Z", now)).toMatch(/Aug/);
  });

  it("is blank for nothing", () => {
    expect(relativeTime(null, now)).toBe("");
  });
});
