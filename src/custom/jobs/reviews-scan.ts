import { dataforseoConfigured } from "@/custom/budget";
import type { JobDefinition } from "./runner";
import { weeklyOn } from "./schedule";

// Weekly Google Business review pull; new reviews become notifications and a
// bad one gets a reply draft.
export const reviewsScanJob: JobDefinition = {
  name: "reviews_scan",
  due: weeklyOn(2, 8),
  run: async ({ env }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };
    return { skipped: "not implemented" };
  },
};
