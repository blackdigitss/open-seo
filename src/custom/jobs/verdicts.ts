import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

// STUB — filled in by the apply-loop task. Concludes Moves whose review date
// arrived: 28d after vs 28d before, with last year's window.
export const verdictsJob: JobDefinition = {
  name: "verdicts",
  due: dailyAfter(9, 30),
  run: async () => ({ skipped: "not implemented" }),
};
