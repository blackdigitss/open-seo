import { describe, expect, it } from "vitest";
import { buildVerdict } from "./verdict";

const at = "2026-09-05T00:00:00.000Z";

describe("buildVerdict", () => {
  it("refuses to judge tiny numbers", () => {
    const verdict = buildVerdict({
      before: 12,
      after: 25,
      lastYearBefore: null,
      lastYearAfter: null,
      computedAt: at,
    });
    expect(verdict.reading).toBe("inconclusive");
    expect(verdict.summary).toContain("Too little traffic");
  });

  it("calls a real gain a gain", () => {
    const verdict = buildVerdict({
      before: 100,
      after: 138,
      lastYearBefore: null,
      lastYearAfter: null,
      computedAt: at,
    });
    expect(verdict.reading).toBe("improved");
    expect(verdict.changePct).toBeCloseTo(0.38);
  });

  it("credits the calendar when last year rose just as much", () => {
    const verdict = buildVerdict({
      before: 100,
      after: 138,
      lastYearBefore: 90,
      lastYearAfter: 126,
      computedAt: at,
    });
    expect(verdict.reading).toBe("flat");
    expect(verdict.summary).toContain("seasonal");
  });

  it("keeps the win when last year was flat through the same window", () => {
    const verdict = buildVerdict({
      before: 100,
      after: 138,
      lastYearBefore: 90,
      lastYearAfter: 92,
      computedAt: at,
    });
    expect(verdict.reading).toBe("improved");
  });

  it("reports a decline", () => {
    expect(
      buildVerdict({
        before: 100,
        after: 60,
        lastYearBefore: null,
        lastYearAfter: null,
        computedAt: at,
      }).reading,
    ).toBe("declined");
  });

  it("says nothing happened when nothing happened", () => {
    expect(
      buildVerdict({
        before: 100,
        after: 104,
        lastYearBefore: null,
        lastYearAfter: null,
        computedAt: at,
      }).reading,
    ).toBe("flat");
  });
});
