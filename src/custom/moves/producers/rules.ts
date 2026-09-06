// The judgement calls the producers make, kept free of database and Google
// imports so they can be tested directly (the same reason ga4Errors.ts and
// gscErrors.ts are leaf modules upstream).
import type { VerifyExpectation } from "@/custom/moves/types";

// ---------------------------------------------------------------------------
// Decay
// ---------------------------------------------------------------------------

/** Below this, a swing is noise on a site with tens of leads a month. */
export const MIN_CLICKS = 30;
/** A drop this steep is worth a look. */
export const DROP_RATIO = 0.7;

export type DecayAssessment = {
  flagged: boolean;
  seasonal: boolean;
  reason: string;
  dropShare: number;
};

/** Does this page's click history warrant a Move? Two guards keep it honest at
 *  small-site scale: a click floor on both windows, and a year-over-year check
 *  so a seasonal business isn't told every September that summer is dying. */
export function assessDecay(input: {
  current: number;
  prior: number;
  lastYearCurrent: number | null;
  lastYearPrior: number | null;
}): DecayAssessment {
  const { current, prior, lastYearCurrent, lastYearPrior } = input;
  const dropShare = prior > 0 ? (prior - current) / prior : 0;

  if (prior < MIN_CLICKS || current < MIN_CLICKS) {
    return {
      flagged: false,
      seasonal: false,
      dropShare,
      reason: `too few clicks to judge (${prior} → ${current})`,
    };
  }
  if (current > DROP_RATIO * prior) {
    return {
      flagged: false,
      seasonal: false,
      dropShare,
      reason: `holding (${prior} → ${current})`,
    };
  }

  // The same slide a year ago means the calendar, not the page.
  const hasLastYear =
    typeof lastYearCurrent === "number" &&
    typeof lastYearPrior === "number" &&
    lastYearPrior >= MIN_CLICKS;
  if (hasLastYear && lastYearCurrent <= DROP_RATIO * lastYearPrior) {
    return {
      flagged: false,
      seasonal: true,
      dropShare,
      reason: `down ${Math.round(dropShare * 100)}%, but it fell the same way last year — seasonal`,
    };
  }

  const yoyNote = hasLastYear
    ? ` · last year this window held at ${lastYearCurrent}`
    : "";
  return {
    flagged: true,
    seasonal: false,
    dropShare,
    reason: `${prior} → ${current} clicks (28d, down ${Math.round(dropShare * 100)}%)${yoyNote}`,
  };
}

// ---------------------------------------------------------------------------
// Audit issues
// ---------------------------------------------------------------------------

export type IssueSeverityName = "critical" | "warning" | "info";

export const SEVERITY_ORDINAL: Record<IssueSeverityName, number> = {
  critical: 0.9,
  warning: 0.6,
  info: 0.3,
};

// Additive or same-intent edits only. Anything that can remove a page from the
// index (noindex, canonicals, redirects) stays out, per DECISIONS.md D6.
const SAFE_ISSUE_TYPES = new Set<string>([
  "missing-title",
  "title-too-long",
  "title-too-short",
  "duplicate-title",
  "missing-meta-description",
  "meta-description-too-long",
  "meta-description-too-short",
  "duplicate-meta-description",
  "images-missing-alt",
  "missing-h1",
]);

export function riskForIssue(
  issueType: string,
  isMoneyPage: boolean,
): "safe" | "risky" {
  if (isMoneyPage) return "risky";
  return SAFE_ISSUE_TYPES.has(issueType) ? "safe" : "risky";
}

/** What the verification crawl should look for once this issue is fixed. */
export function verifyForIssue(issueType: string): VerifyExpectation {
  switch (issueType) {
    case "missing-title":
    case "title-too-long":
    case "title-too-short":
    case "duplicate-title":
      return { kind: "title", minLength: 20, maxLength: 70 };
    case "missing-meta-description":
    case "meta-description-too-long":
    case "meta-description-too-short":
    case "duplicate-meta-description":
      return {
        kind: "meta_description",
        present: true,
        minLength: 50,
        maxLength: 170,
      };
    case "images-missing-alt":
      return { kind: "images_alt", maxMissing: 0 };
    case "server-error":
    case "broken-page":
    case "broken-internal-link":
      return { kind: "status", equals: 200 };
    default:
      return { kind: "none" };
  }
}
