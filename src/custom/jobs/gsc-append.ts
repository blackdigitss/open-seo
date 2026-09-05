import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

// STUB — filled in by the data-foundations task. Appends yesterday-3 (GSC lag)
// page and page×query rows for every GSC-connected project.
export const gscAppendJob: JobDefinition = {
  name: "gsc_append",
  due: dailyAfter(8),
  run: async () => ({ skipped: "not implemented" }),
};
