// Reading a result honestly at small-site scale: before/after with last year
// drawn alongside, and the humility to say "inconclusive" when the numbers are
// too small to mean anything (DECISIONS.md D7).
import type { Verdict } from "@/custom/moves/types";

/** Below this in either window, a percentage change is noise. */
export const MIN_CLICKS = 30;
const IMPROVED = 0.2;
const DECLINED = -0.2;
/** How far the change must beat the same period last year to count as ours. */
const SEASONAL_MARGIN = 0.1;

export type VerdictInput = {
  before: number;
  after: number;
  lastYearBefore: number | null;
  lastYearAfter: number | null;
  computedAt: string;
};

function pctChange(before: number, after: number): number | null {
  if (before <= 0) return null;
  return (after - before) / before;
}

export function buildVerdict(input: VerdictInput): Verdict {
  const changePct = pctChange(input.before, input.after);
  const seasonalChangePct =
    input.lastYearBefore !== null && input.lastYearAfter !== null
      ? pctChange(input.lastYearBefore, input.lastYearAfter)
      : null;

  const base: Omit<Verdict, "reading" | "summary"> = {
    computedAt: input.computedAt,
    metric: "clicks",
    before: input.before,
    after: input.after,
    lastYearBefore: input.lastYearBefore,
    lastYearAfter: input.lastYearAfter,
    changePct,
    seasonalChangePct,
  };

  if (input.before < MIN_CLICKS || input.after < MIN_CLICKS) {
    return {
      ...base,
      reading: "inconclusive",
      summary: `Too little traffic to call: ${input.before} clicks before, ${input.after} after. Leaving it in place is fine — it just can't be measured at this volume.`,
    };
  }

  const change = changePct ?? 0;
  const percent = Math.round(change * 100);
  const seasonalNote =
    seasonalChangePct === null
      ? ""
      : ` The same window last year moved ${Math.round(seasonalChangePct * 100)}%.`;

  if (change >= IMPROVED) {
    // A rise that merely matches last year's is the calendar, not the change.
    const beatsSeason =
      seasonalChangePct === null ||
      change - seasonalChangePct >= SEASONAL_MARGIN;
    return {
      ...base,
      reading: beatsSeason ? "improved" : "flat",
      summary: beatsSeason
        ? `Clicks went from ${input.before} to ${input.after} (+${percent}%).${seasonalNote} That reads as a real gain — worth doing again on similar pages.`
        : `Clicks rose ${percent}%, but roughly as much as this window rose last year.${seasonalNote} Treat it as seasonal rather than a win.`,
    };
  }

  if (change <= DECLINED) {
    return {
      ...base,
      reading: "declined",
      summary: `Clicks fell from ${input.before} to ${input.after} (${percent}%).${seasonalNote} Worth a look at whether the change hurt or something else moved.`,
    };
  }

  return {
    ...base,
    reading: "flat",
    summary: `Clicks went from ${input.before} to ${input.after} (${percent >= 0 ? "+" : ""}${percent}%).${seasonalNote} No real movement either way.`,
  };
}
