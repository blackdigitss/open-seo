import { describe, expect, it } from "vitest";
import {
  mergeRules,
  normalizePath,
  rulesForPath,
  rulesFromSnippet,
  EMPTY_RULESET,
  type EdgeRule,
} from "./rules";

const rule = (overrides: Partial<EdgeRule>): EdgeRule => ({
  id: "r1",
  moveId: "m1",
  path: "/",
  kind: "title",
  value: "T",
  createdAt: "2026-09-07T00:00:00.000Z",
  ...overrides,
});

describe("rulesFromSnippet", () => {
  it("extracts the title and meta a move proposes", () => {
    const rules = rulesFromSnippet({
      moveId: "m1",
      targetUrl: "https://walkersnotary.com/course/",
      snippet:
        '<title>NY Notary Exam Course | Walker&amp;s</title>\n<meta name="description" content="Pass the exam &quot;fast&quot;.">',
      now: "2026-09-07T00:00:00.000Z",
    });
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({
      kind: "title",
      path: "/course",
      value: "NY Notary Exam Course | Walker&s",
    });
    expect(rules[1]).toMatchObject({
      kind: "meta_description",
      value: 'Pass the exam "fast".',
    });
  });

  it("returns nothing for a snippet with no head tags (JSON-LD, redirects)", () => {
    expect(
      rulesFromSnippet({
        moveId: "m1",
        targetUrl: "https://example.com/a",
        snippet: '<script type="application/ld+json">{}</script>',
        now: "now",
      }),
    ).toHaveLength(0);
  });
});

describe("rulesForPath", () => {
  it("matches normalized paths and honors the kill flag", () => {
    const set = { kill: false, rules: [rule({ path: "/course" })] };
    expect(rulesForPath(set, "/course/")).toHaveLength(1);
    expect(rulesForPath(set, "/other")).toHaveLength(0);
    expect(rulesForPath({ ...set, kill: true }, "/course")).toHaveLength(0);
  });
});

describe("mergeRules", () => {
  it("replaces an older rule for the same path and kind", () => {
    const merged = mergeRules(
      { ...EMPTY_RULESET, rules: [rule({ value: "old" })] },
      [rule({ id: "r2", value: "new" })],
    );
    expect(merged.rules).toHaveLength(1);
    expect(merged.rules[0].value).toBe("new");
  });
});

describe("normalizePath", () => {
  it("lowercases and strips trailing slashes, keeping root as /", () => {
    expect(normalizePath("/Course/")).toBe("/course");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
  });
});
