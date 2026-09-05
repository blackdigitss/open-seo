import type { JobDefinition } from "./runner";
import { monthlyOn } from "./schedule";

// STUB — filled in by the intelligence task. Monthly AI-visibility (brand
// lookup) snapshot per project, persisted to custom_snapshots.
export const brandMonthlyJob: JobDefinition = {
  name: "brand_monthly",
  due: monthlyOn(2, 8),
  run: async () => ({ skipped: "not implemented" }),
};
