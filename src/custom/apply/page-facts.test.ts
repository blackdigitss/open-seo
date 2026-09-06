import { describe, expect, it } from "vitest";
import { evaluate, type PageFacts } from "./page-facts";

const facts = (overrides: Partial<PageFacts> = {}): PageFacts => ({
  status: 200,
  finalUrl: "https://example.com/page",
  title: "Mobile Notary in Brooklyn | Walker's Notary",
  metaDescription:
    "A mobile notary who comes to you anywhere in Brooklyn, most evenings and weekends. Same-day appointments available.",
  canonical: "https://example.com/page",
  robotsMeta: null,
  jsonLdTypes: ["LocalBusiness"],
  imagesTotal: 4,
  imagesMissingAlt: 0,
  textSample: "a mobile notary who comes to you",
  ...overrides,
});

describe("evaluate", () => {
  it("passes an expectation of nothing", () => {
    expect(evaluate({ kind: "none" }, facts()).ok).toBe(true);
  });

  it("matches an exact title and reports both sides when it doesn't", () => {
    const expectation = { kind: "title", equals: "Something else" } as const;
    const result = evaluate(expectation, facts());
    expect(result.ok).toBe(false);
    expect(result.details).toMatchObject({ expected: "Something else" });
  });

  it("checks title length when no exact title was proposed", () => {
    expect(
      evaluate({ kind: "title", minLength: 20, maxLength: 70 }, facts()).ok,
    ).toBe(true);
    expect(
      evaluate({ kind: "title", minLength: 20 }, facts({ title: "Short" })).ok,
    ).toBe(false);
  });

  it("fails a missing meta description rather than passing an empty one", () => {
    expect(
      evaluate(
        { kind: "meta_description", present: true },
        facts({ metaDescription: null }),
      ).ok,
    ).toBe(false);
  });

  it("ignores trailing-slash differences on canonicals", () => {
    expect(
      evaluate(
        { kind: "canonical", equals: "https://example.com/page/" },
        facts(),
      ).ok,
    ).toBe(true);
  });

  it("finds a JSON-LD type case-insensitively", () => {
    expect(
      evaluate({ kind: "jsonld", type: "localbusiness" }, facts()).ok,
    ).toBe(true);
    expect(evaluate({ kind: "jsonld", type: "FAQPage" }, facts()).ok).toBe(
      false,
    );
  });

  it("counts images missing alt text against the allowance", () => {
    expect(
      evaluate(
        { kind: "images_alt", maxMissing: 0 },
        facts({ imagesMissingAlt: 2 }),
      ).ok,
    ).toBe(false);
  });

  it("looks for text anywhere in the sample", () => {
    expect(
      evaluate({ kind: "text_present", text: "COMES TO YOU" }, facts()).ok,
    ).toBe(true);
  });

  it("compares status codes", () => {
    expect(
      evaluate({ kind: "status", equals: 200 }, facts({ status: 404 })).ok,
    ).toBe(false);
  });
});
