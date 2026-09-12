import { describe, expect, it } from "vitest";
import { groupByPage, sequencePage } from "./pageGroup";
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

describe("sequencePage", () => {
  it("puts indexability before substance before the tags, whatever the scores say", () => {
    const ordered = sequencePage([
      move({
        id: "retitle",
        score: 0.9,
        snippet: "<title>x</title>",
      }),
      move({
        id: "refresh",
        score: 0.5,
        source: "decay",
        targetUrl: "https://site.test/services",
      }),
      move({
        id: "broken",
        score: 0.1,
        evidenceJson: JSON.stringify({
          verify: { kind: "status", equals: 200 },
        }),
      }),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual([
      "broken",
      "refresh",
      "retitle",
    ]);
  });
});

describe("groupByPage", () => {
  it("bundles a page's work together and leads with the page that matters most", () => {
    const groups = groupByPage([
      move({ id: "a", score: 0.4 }),
      move({ id: "b", score: 0.9, targetUrl: "https://site.test/contact" }),
      move({ id: "c", score: 0.2, targetUrl: "https://site.test/services/" }),
    ]);

    expect(groups.map((group) => group.moves.map((entry) => entry.id))).toEqual(
      [["b"], ["a", "c"]],
    );
  });
});
