import { dataforseoConfigured } from "@/custom/budget";
import type { JobDefinition } from "./runner";
import { monthlyOn } from "./schedule";

// Monthly brand search volume, as a trend.
export const brandVolumeMonthlyJob: JobDefinition = {
  name: "brand_volume_monthly",
  due: monthlyOn(4, 8),
  run: async ({ env }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };
    return { skipped: "not implemented" };
  },
};
