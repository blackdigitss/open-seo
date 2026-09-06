import { dataforseoConfigured } from "@/custom/budget";
import type { JobDefinition } from "./runner";
import { monthlyOn } from "./schedule";

// Monthly AI-visibility snapshot, persisted so "over time" exists (upstream
// discards each lookup).
export const brandMonthlyJob: JobDefinition = {
  name: "brand_monthly",
  due: monthlyOn(2, 8),
  run: async ({ env }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };
    return { skipped: "not implemented" };
  },
};
