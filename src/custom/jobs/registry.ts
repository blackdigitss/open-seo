// Every scheduled job, in the order they run within a tick. Order matters:
// gsc_append feeds moves_refresh, which feeds the weekly plan.
import type { JobDefinition } from "./runner";
import { gscAppendJob } from "./gsc-append";
import { movesRefreshJob } from "./moves-refresh";
import { verifyCrawlJob } from "./verify-crawl";
import { verdictsJob } from "./verdicts";
import { weeklyPlanJob } from "./weekly-plan";
import { reviewsScanJob } from "./reviews-scan";
import { rankWeeklyJob } from "./rank-weekly";
import { brandMonthlyJob } from "./brand-monthly";
import { competitorGapMonthlyJob } from "./competitor-gap-monthly";
import { brandVolumeMonthlyJob } from "./brand-volume-monthly";
import { budgetWatchJob } from "./budget-watch";
import { indexingWatchJob } from "./indexing-watch";
import { autoApplyJob } from "./auto-apply";
import { configSyncJob } from "./config-sync";

export const jobs: readonly JobDefinition[] = [
  configSyncJob,
  gscAppendJob,
  movesRefreshJob,
  verifyCrawlJob,
  autoApplyJob,
  indexingWatchJob,
  verdictsJob,
  weeklyPlanJob,
  reviewsScanJob,
  rankWeeklyJob,
  brandMonthlyJob,
  competitorGapMonthlyJob,
  brandVolumeMonthlyJob,
  budgetWatchJob,
];

export function findJob(name: string): JobDefinition | undefined {
  return jobs.find((job) => job.name === name);
}
