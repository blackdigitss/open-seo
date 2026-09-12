import { describe, expect, it } from "vitest";
import { clusterQueries } from "./cluster";

type Row = { query: string; gain: number };

const cluster = (rows: Row[]) =>
  clusterQueries(
    rows,
    (row) => row.query,
    (row) => row.gain,
  );

describe("clusterQueries", () => {
  it("collapses wordings of the same question into one cluster led by the biggest", () => {
    const clusters = cluster([
      { query: "mobile notary near me", gain: 4 },
      { query: "mobile notary", gain: 9 },
      { query: "best mobile notary services", gain: 2 },
      { query: "mobile notaries", gain: 1 },
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].primary.query).toBe("mobile notary");
    expect(clusters[0].weight).toBe(16);
  });

  it("keeps genuinely different questions apart", () => {
    const clusters = cluster([
      { query: "mobile notary", gain: 9 },
      { query: "notary fees", gain: 5 },
      { query: "apostille service", gain: 3 },
    ]);

    expect(clusters.map((entry) => entry.primary.query)).toEqual([
      "mobile notary",
      "notary fees",
      "apostille service",
    ]);
  });

  it("treats a containing phrase as the same job", () => {
    const clusters = cluster([
      { query: "notary", gain: 6 },
      { query: "notary near me", gain: 4 },
    ]);

    expect(clusters).toHaveLength(1);
  });
});
