import { describe, expect, it } from "vitest";
import { assessDecay } from "./rules";

describe("assessDecay", () => {
  it("flags a real drop", () => {
    const result = assessDecay({
      current: 40,
      prior: 100,
      lastYearCurrent: null,
      lastYearPrior: null,
    });
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain("down 60%");
  });

  it("stays quiet below the click floor, however steep the fall", () => {
    expect(
      assessDecay({
        current: 2,
        prior: 29,
        lastYearCurrent: null,
        lastYearPrior: null,
      }).flagged,
    ).toBe(false);
  });

  it("stays quiet when the page is merely wobbling", () => {
    expect(
      assessDecay({
        current: 80,
        prior: 100,
        lastYearCurrent: null,
        lastYearPrior: null,
      }).flagged,
    ).toBe(false);
  });

  it("does not cry decay when the same slide happened last year", () => {
    const result = assessDecay({
      current: 40,
      prior: 100,
      lastYearCurrent: 38,
      lastYearPrior: 95,
    });
    expect(result.flagged).toBe(false);
    expect(result.seasonal).toBe(true);
  });

  it("still flags when last year held steady through the same window", () => {
    const result = assessDecay({
      current: 40,
      prior: 100,
      lastYearCurrent: 92,
      lastYearPrior: 95,
    });
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain("last year");
  });
});
