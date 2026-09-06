import { describe, expect, it } from "vitest";
import { brandTerms } from "./brand-terms";

describe("brandTerms", () => {
  it("includes the cleaned name and the domain word", () => {
    const terms = brandTerms(
      "Walker's Notary LLC",
      "https://walkersnotary.com",
    );
    expect(terms).toContain("walker's notary");
    expect(terms).toContain("walkersnotary");
  });

  it("drops corporate suffixes and caps the list", () => {
    const terms = brandTerms("Acme Co", null);
    expect(terms.every((term) => !term.includes("co "))).toBe(true);
    expect(terms.length).toBeLessThanOrEqual(4);
  });
});
