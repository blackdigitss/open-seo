import { desc } from "drizzle-orm";
import { db } from "@/db";
import { customJobRuns } from "@/db/custom/schema";

export async function getRecentRuns(limit: number) {
  return db
    .select({
      job: customJobRuns.job,
      periodKey: customJobRuns.periodKey,
      status: customJobRuns.status,
      attempts: customJobRuns.attempts,
      startedAt: customJobRuns.startedAt,
      finishedAt: customJobRuns.finishedAt,
      error: customJobRuns.error,
    })
    .from(customJobRuns)
    .orderBy(desc(customJobRuns.startedAt))
    .limit(limit);
}
