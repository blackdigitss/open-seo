import type { JobDefinition } from "./runner";
import { monthlyOn } from "./schedule";

// STUB — filled in by the intelligence task. Monthly search volume for each
// project's brand terms, persisted as a trend.
export const brandVolumeMonthlyJob: JobDefinition = {
  name: "brand_volume_monthly",
  due: monthlyOn(4, 8),
  run: async () => ({ skipped: "not implemented" }),
};
