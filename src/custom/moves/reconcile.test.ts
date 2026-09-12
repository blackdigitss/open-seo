import { describe, expect, it } from "vitest";
import { planReconcile } from "./reconcile";
import type { MoveRow } from "./types";

function move(overrides: Partial<MoveRow> & { id: string }): MoveRow {
  return {
    projectId: "p1",
    dedupeKey: overrides.id,
    type: "fix",
    source: "audit",
    title: overrides.id,
    hypothesis: "",
    reason: "",
    evidenceJson: "{}",
    targetUrl: "https://site.test/services",
    targetQuery: null,
    before: null,
    after: null,
    draft: null,
    snippet: null,
    whySafe: null,
    riskTier: "safe",
    score: 0.5,
    scoreInputsJson: "{}",
    valueBucket: null,
    status: "open",
    appliedAt: null,
    verifyUrl: null,
    verifiedAt: null,
    verifyResultJson: null,
    reviewAt: null,
    verdictJson: null,
    supersededBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const retitle = (id: string, score: number, rest: Partial<MoveRow> = {}) =>
  move({
    id,
    score,
    source: "striking_distance",
    type: "opening",
    snippet: "<title>x</title>",
    evidenceJson: JSON.stringify({ verify: { kind: "title", equals: "x" } }),
    ...rest,
  });

describe("planReconcile", () => {
  it("leaves one writer per page surface and holds the rest back", () => {
    const plan = planReconcile([retitle("big", 0.8), retitle("small", 0.3)]);

    expect(plan.supersede).toEqual([{ moveId: "small", supersededBy: "big" }]);
  });

  it("leaves complementary work on the same page alone", () => {
    const plan = planReconcile([
      retitle("title", 0.8),
      move({
        id: "alt-text",
        score: 0.4,
        evidenceJson: JSON.stringify({ verify: { kind: "images_alt" } }),
      }),
    ]);

    expect(plan.supersede).toEqual([]);
  });

  it("does not compare moves on different pages", () => {
    const plan = planReconcile([
      retitle("a", 0.8),
      retitle("b", 0.3, { targetUrl: "https://site.test/contact" }),
    ]);

    expect(plan.supersede).toEqual([]);
  });

  it("reads a trailing slash as the same page", () => {
    const plan = planReconcile([
      retitle("a", 0.8),
      retitle("b", 0.3, { targetUrl: "https://site.test/services/" }),
    ]);

    expect(plan.supersede).toEqual([{ moveId: "b", supersededBy: "a" }]);
  });

  it("brings a held move back once the winner is out of the way", () => {
    const plan = planReconcile([
      retitle("small", 0.3, { status: "superseded", supersededBy: "big" }),
    ]);

    expect(plan.reopen).toEqual(["small"]);
    expect(plan.supersede).toEqual([]);
  });

  it("is idempotent while the winner still holds the surface", () => {
    const plan = planReconcile([
      retitle("big", 0.8),
      retitle("small", 0.3, { status: "superseded", supersededBy: "big" }),
    ]);

    expect(plan).toEqual({ supersede: [], reopen: [] });
  });

  it("holds back an audit fix the opening's rewrite already covers", () => {
    const plan = planReconcile([
      // The opening rewrites both tags; the audit issue only asks for one of
      // them, so doing the opening does the audit fix too.
      retitle("opening", 0.8, {
        snippet: '<title>x</title>\n<meta name="description" content="y">',
      }),
      move({
        id: "short-title",
        score: 0.4,
        evidenceJson: JSON.stringify({
          verify: { kind: "title", minLength: 30 },
          issueType: "title-too-short",
        }),
      }),
    ]);

    expect(plan.supersede).toEqual([
      { moveId: "short-title", supersededBy: "opening" },
    ]);
  });
});
