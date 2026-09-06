// What a page currently says, and whether a Move's expectation is now met.
// Kept free of network imports so `evaluate` can be tested directly.
import type { VerifyExpectation } from "@/custom/moves/types";

export type PageFacts = {
  status: number;
  finalUrl: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  jsonLdTypes: string[];
  imagesTotal: number;
  imagesMissingAlt: number;
  textSample: string;
};

export type Evaluation = { ok: boolean; details: Record<string, unknown> };

function lengthOk(
  value: string,
  min: number | undefined,
  max: number | undefined,
): boolean {
  if (min !== undefined && value.length < min) return false;
  if (max !== undefined && value.length > max) return false;
  return true;
}

const stripUrl = (url: string) => url.trim().replace(/\/+$/, "").toLowerCase();

function sameUrl(a: string, b: string): boolean {
  return stripUrl(a) === stripUrl(b);
}

/** Did the change actually land? `details` explains the answer either way, so a
 *  failed verification reads as "expected X, found Y" in the notification. */
export function evaluate(
  expectation: VerifyExpectation,
  facts: PageFacts,
): Evaluation {
  switch (expectation.kind) {
    case "none":
      return {
        ok: true,
        details: { checked: "nothing", status: facts.status },
      };

    case "status":
      return {
        ok: facts.status === expectation.equals,
        details: { expected: expectation.equals, found: facts.status },
      };

    case "title": {
      const title = facts.title?.trim() ?? "";
      if (!title)
        return { ok: false, details: { expected: "a title", found: null } };
      if (expectation.equals !== undefined) {
        return {
          ok: title === expectation.equals.trim(),
          details: { expected: expectation.equals, found: title },
        };
      }
      return {
        ok: lengthOk(title, expectation.minLength, expectation.maxLength),
        details: {
          found: title,
          length: title.length,
          minLength: expectation.minLength,
          maxLength: expectation.maxLength,
        },
      };
    }

    case "meta_description": {
      const meta = facts.metaDescription?.trim() ?? "";
      if (!meta) {
        return {
          ok: false,
          details: { expected: "a meta description", found: null },
        };
      }
      return {
        ok: lengthOk(meta, expectation.minLength, expectation.maxLength),
        details: {
          found: meta,
          length: meta.length,
          minLength: expectation.minLength,
          maxLength: expectation.maxLength,
        },
      };
    }

    case "canonical": {
      const canonical = facts.canonical?.trim() ?? "";
      if (expectation.equals !== undefined) {
        return {
          ok: Boolean(canonical) && sameUrl(canonical, expectation.equals),
          details: { expected: expectation.equals, found: canonical || null },
        };
      }
      return {
        ok: Boolean(canonical),
        details: { expected: "a canonical", found: canonical || null },
      };
    }

    case "jsonld": {
      const wanted = expectation.type.toLowerCase();
      const found = facts.jsonLdTypes.map((t) => t.toLowerCase());
      return {
        ok: found.includes(wanted),
        details: { expected: expectation.type, found: facts.jsonLdTypes },
      };
    }

    case "images_alt":
      return {
        ok: facts.imagesMissingAlt <= expectation.maxMissing,
        details: {
          missingAlt: facts.imagesMissingAlt,
          allowed: expectation.maxMissing,
          imagesTotal: facts.imagesTotal,
        },
      };

    case "text_present": {
      const needle = expectation.text.trim().toLowerCase();
      return {
        ok: facts.textSample.toLowerCase().includes(needle),
        details: { expected: expectation.text, status: facts.status },
      };
    }

    default:
      return { ok: true, details: {} };
  }
}
