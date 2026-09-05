import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

// STUB — filled in by the apply-loop task. Fetches each applied Move's verify
// URL and checks the expectation in evidence.verify; pings IndexNow.
export const verifyCrawlJob: JobDefinition = {
  name: "verify_crawl",
  due: dailyAfter(9),
  run: async () => ({ skipped: "not implemented" }),
};
