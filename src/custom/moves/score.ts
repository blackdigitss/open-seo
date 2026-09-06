// Ranking, per DECISIONS.md D2: ordinal within a site, money-aware across
// sites, dollars only as three buckets. `score` is 0..1 and comparable across
// projects because the site multiplier is folded in; `reason` is the one-line
// human explanation shown next to every move.
import type { MoveValueBucket } from "./types";

export type SiteEconomics = {
  valuePerLeadUsd: number;
  closeRate: number;
  siteConversionRate: number;
};

export const DEFAULT_ECONOMICS: SiteEconomics = {
  valuePerLeadUsd: 100,
  closeRate: 0.5,
  siteConversionRate: 0.02,
};

type ScoreInput = {
  // 0..1 relative importance within the site (percentile, severity, …).
  ordinal: number;
  // Monthly clicks the move could add or protect; 0 when unknown.
  upsideClicks: number;
  economics: SiteEconomics;
  // Money pages and hub pages pull more weight.
  pageRole?: "money" | "hub" | "spoke" | "other" | null;
};

type ScoreResult = {
  score: number;
  valueBucket: MoveValueBucket | null;
  monthlyValueUsd: number;
  inputs: Record<string, number | string | null>;
};

// Compresses a monthly dollar figure into 0..1; $500/month saturates.
function moneyToUnit(usd: number): number {
  return 1 - Math.exp(-usd / 150);
}

function bucketFor(monthlyValueUsd: number): MoveValueBucket | null {
  if (monthlyValueUsd <= 0) return null;
  if (monthlyValueUsd < 50) return "low";
  if (monthlyValueUsd <= 250) return "mid";
  return "high";
}

export function scoreMove(input: ScoreInput): ScoreResult {
  const roleWeight =
    input.pageRole === "money" ? 1.5 : input.pageRole === "hub" ? 1.2 : 1;
  const ordinal = Math.min(1, Math.max(0, input.ordinal)) * roleWeight;
  const monthlyValueUsd =
    input.upsideClicks *
    input.economics.siteConversionRate *
    input.economics.closeRate *
    input.economics.valuePerLeadUsd;

  // Half the score is the site's own ordinal view, half is money, so a
  // low-traffic site's top fix still surfaces beside a big site's mid one.
  const score = Math.min(
    1,
    0.5 * Math.min(1, ordinal) + 0.5 * moneyToUnit(monthlyValueUsd),
  );

  return {
    score: Number(score.toFixed(4)),
    valueBucket: bucketFor(monthlyValueUsd),
    monthlyValueUsd: Math.round(monthlyValueUsd),
    inputs: {
      ordinal: Number(input.ordinal.toFixed(3)),
      upsideClicks: input.upsideClicks,
      pageRole: input.pageRole ?? null,
      valuePerLeadUsd: input.economics.valuePerLeadUsd,
      closeRate: input.economics.closeRate,
      siteConversionRate: input.economics.siteConversionRate,
      monthlyValueUsd: Math.round(monthlyValueUsd),
    },
  };
}

export function formatBucket(bucket: MoveValueBucket | null): string {
  switch (bucket) {
    case "low":
      return "under $50/mo";
    case "mid":
      return "$50–250/mo";
    case "high":
      return "over $250/mo";
    default:
      return "";
  }
}
