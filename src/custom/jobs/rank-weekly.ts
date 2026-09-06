import { dataforseoConfigured } from "@/custom/budget";
import type { JobDefinition } from "./runner";
import { weeklyOn } from "./schedule";

// Keeps each project's rank tracker running weekly at depth 20 — the band
// striking-distance openings come from.
export const rankWeeklyJob: JobDefinition = {
  name: "rank_weekly",
  due: weeklyOn(3, 8),
  run: async ({ env }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };
    return { skipped: "not implemented" };
  },
};
