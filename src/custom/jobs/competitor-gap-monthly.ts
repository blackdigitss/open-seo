import type { JobDefinition } from "./runner";
import { monthlyOn } from "./schedule";

// STUB — filled in by the intelligence task. Monthly keyword-gap diff against
// each project's competitors; gaps become opening Moves.
export const competitorGapMonthlyJob: JobDefinition = {
  name: "competitor_gap_monthly",
  due: monthlyOn(3, 8),
  run: async () => ({ skipped: "not implemented" }),
};
