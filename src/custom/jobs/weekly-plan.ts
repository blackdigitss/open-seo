import type { JobDefinition } from "./runner";
import { weeklyOn } from "./schedule";

// STUB — filled in by the moves-producers task. Monday plan: ranked open
// Moves across every project, verdicts due, spend; one notification.
export const weeklyPlanJob: JobDefinition = {
  name: "weekly_plan",
  due: weeklyOn(1, 11, 30),
  run: async () => ({ skipped: "not implemented" }),
};
