import type { JobDefinition } from "./runner";
import { weeklyOn } from "./schedule";

// STUB — filled in by the intelligence task. Ensures every project's rank
// tracker runs weekly at depth 20 (the striking-distance band) under budget.
export const rankWeeklyJob: JobDefinition = {
  name: "rank_weekly",
  due: weeklyOn(3, 8),
  run: async () => ({ skipped: "not implemented" }),
};
