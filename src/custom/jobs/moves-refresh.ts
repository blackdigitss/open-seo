import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

// STUB — filled in by the moves-producers task. Runs every producer (openings,
// decay, audit deltas, reviews) for every project and upserts Moves.
export const movesRefreshJob: JobDefinition = {
  name: "moves_refresh",
  due: dailyAfter(8, 30),
  run: async () => ({ skipped: "not implemented" }),
};
