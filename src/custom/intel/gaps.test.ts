import { describe, expect, it } from "vitest";
import { diffGaps, mergeGaps } from "./gaps";

const row = (
  keyword: string,
  position: number | null,
  volume: number | null,
) => ({
  keyword,
  position,
  volume,
});

describe("diffGaps", () => {
  it("keeps only top-20 competitor keywords we don't rank for", () => {
    const gaps = diffGaps({
      ours: [row("mobile notary", 4, 500)],
      competitor: "rival.com",
      theirs: [
        row("mobile notary", 2, 500), // we rank — not a gap
        row("apostille service", 8, 300),
        row("loan signing agent", 35, 900), // past 20 — not a gap
        row("notary near me", null, 100), // unranked — not a gap
      ],
    });
    expect(gaps).toEqual([
      {
        keyword: "apostille service",
        volume: 300,
        competitor: "rival.com",
        competitorPosition: 8,
      },
    ]);
  });

  it("matches keywords case-insensitively", () => {
    const gaps = diffGaps({
      ours: [row("Mobile Notary", 4, 500)],
      competitor: "rival.com",
      theirs: [row("mobile notary", 3, 500)],
    });
    expect(gaps).toHaveLength(0);
  });

  it("orders by volume and honors the limit", () => {
    const gaps = diffGaps({
      ours: [],
      competitor: "rival.com",
      theirs: [row("a", 5, 10), row("b", 5, 900), row("c", 5, 100)],
      limit: 2,
    });
    expect(gaps.map((gap) => gap.keyword)).toEqual(["b", "c"]);
  });
});

describe("mergeGaps", () => {
  it("keeps one entry per keyword, from the strongest competitor", () => {
    const merged = mergeGaps([
      {
        keyword: "apostille",
        volume: 200,
        competitor: "a.com",
        competitorPosition: 9,
      },
      {
        keyword: "apostille",
        volume: 300,
        competitor: "b.com",
        competitorPosition: 4,
      },
      {
        keyword: "witness service",
        volume: 50,
        competitor: "a.com",
        competitorPosition: 12,
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      keyword: "apostille",
      competitor: "b.com",
    });
  });
});
