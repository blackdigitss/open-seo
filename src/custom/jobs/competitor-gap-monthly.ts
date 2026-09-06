import { dataforseoConfigured } from "@/custom/budget";
import type { JobDefinition } from "./runner";
import { monthlyOn } from "./schedule";

// Monthly keyword-gap diff against each competitor; gaps become openings.
export const competitorGapMonthlyJob: JobDefinition = {
  name: "competitor_gap_monthly",
  due: monthlyOn(3, 8),
  run: async ({ env }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };
    return { skipped: "not implemented" };
  },
};
