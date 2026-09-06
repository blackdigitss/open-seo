import { describe, expect, it } from "vitest";
import { parseReviewItem, reviewStats } from "./reviews";

describe("parseReviewItem", () => {
  it("reads the fields monitoring needs", () => {
    const parsed = parseReviewItem({
      review_id: "r1",
      profile_name: "Jamie",
      rating: { value: 5 },
      review_text: "Fast and friendly.",
      timestamp: "2026-08-30 14:00:00 +00:00",
      owner_answer: "Thank you!",
    });
    expect(parsed).toEqual({
      externalId: "r1",
      author: "Jamie",
      rating: 5,
      text: "Fast and friendly.",
      publishedAt: "2026-08-30 14:00:00 +00:00",
      ownerReplied: true,
    });
  });

  it("builds a stable id when review_id is missing", () => {
    const item = {
      profile_name: "Sam",
      timestamp: "2026-08-01",
      review_text: "Fine.",
    };
    expect(parseReviewItem(item)?.externalId).toBe(
      parseReviewItem(item)?.externalId,
    );
  });

  it("drops an item with nothing identifying", () => {
    expect(parseReviewItem({})).toBeNull();
  });
});

describe("reviewStats", () => {
  it("averages ratings and finds the bad and unanswered ones", () => {
    const reviews = [
      {
        externalId: "1",
        author: null,
        rating: 5,
        text: null,
        publishedAt: null,
        ownerReplied: true,
      },
      {
        externalId: "2",
        author: null,
        rating: 2,
        text: "slow",
        publishedAt: null,
        ownerReplied: false,
      },
      {
        externalId: "3",
        author: null,
        rating: null,
        text: null,
        publishedAt: null,
        ownerReplied: false,
      },
    ];
    const stats = reviewStats(reviews);
    expect(stats.count).toBe(3);
    expect(stats.averageRating).toBeCloseTo(3.5);
    expect(stats.unanswered).toBe(2);
    expect(stats.bad.map((review) => review.externalId)).toEqual(["2"]);
  });
});
