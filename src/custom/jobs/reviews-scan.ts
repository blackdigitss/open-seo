import type { JobDefinition } from "./runner";
import { weeklyOn } from "./schedule";

// STUB — filled in by the intelligence task. Weekly Google Business review
// pull per project (needs a DataForSEO key and a business name); new reviews
// become notifications, bad ones immediately.
export const reviewsScanJob: JobDefinition = {
  name: "reviews_scan",
  due: weeklyOn(2, 8),
  run: async () => ({ skipped: "not implemented" }),
};
