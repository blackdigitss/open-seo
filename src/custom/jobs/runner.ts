// The custom Worker's job ledger. Every job names the period it wants to run
// for (a day, an ISO week, a month); the 5-minute cron claims that period once
// in custom_job_runs, runs the job, and records the outcome. A failure is
// retried on later ticks up to maxAttempts; a success never re-runs.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customJobRuns } from "@/db/custom/schema";
import { createLogger, errorMessage, type Logger } from "@/custom/lib/log";
import { isoNow } from "@/custom/lib/time";

export type JobContext = {
  env: Cloudflare.Env;
  now: Date;
  periodKey: string;
  log: Logger;
};

export type JobDefinition = {
  name: string;
  /** The period key this job should run for right now, or null to skip. */
  due: (now: Date) => string | null;
  run: (ctx: JobContext) => Promise<Record<string, unknown> | void>;
  maxAttempts?: number;
};

// A run stuck in "running" past this is presumed dead (the isolate was killed
// mid-job) and may be reclaimed.
const STALE_RUNNING_MS = 20 * 60_000;
// Cron invocations are killed at 15 minutes; leave headroom.
const TICK_BUDGET_MS = 11 * 60_000;

async function claim(job: JobDefinition, periodKey: string, now: Date) {
  const [existing] = await db
    .select()
    .from(customJobRuns)
    .where(
      and(
        eq(customJobRuns.job, job.name),
        eq(customJobRuns.periodKey, periodKey),
      ),
    )
    .limit(1);

  if (!existing) {
    const id = crypto.randomUUID();
    await db.insert(customJobRuns).values({
      id,
      job: job.name,
      periodKey,
      status: "running",
      attempts: 1,
      startedAt: now.toISOString(),
    });
    return { id, attempts: 1 };
  }

  if (existing.status === "succeeded") return null;

  const maxAttempts = job.maxAttempts ?? 3;
  const stale =
    existing.status === "running" &&
    Date.parse(existing.startedAt) < now.getTime() - STALE_RUNNING_MS;
  if (existing.status === "running" && !stale) return null;
  if (existing.attempts >= maxAttempts) return null;

  const attempts = existing.attempts + 1;
  await db
    .update(customJobRuns)
    .set({
      status: "running",
      attempts,
      startedAt: now.toISOString(),
      finishedAt: null,
      error: null,
    })
    .where(eq(customJobRuns.id, existing.id));
  return { id: existing.id, attempts };
}

export async function runDueJobs(
  env: Cloudflare.Env,
  jobs: readonly JobDefinition[],
  now: Date,
) {
  const log = createLogger("runner");
  const tickStart = Date.now();
  const outcomes: Array<{ job: string; periodKey: string; status: string }> =
    [];

  for (const job of jobs) {
    if (Date.now() - tickStart > TICK_BUDGET_MS) {
      log("tick budget exhausted; remaining jobs wait for the next tick");
      break;
    }
    const periodKey = job.due(now);
    if (!periodKey) continue;

    const claimed = await claim(job, periodKey, now);
    if (!claimed) continue;

    const jobLog = createLogger(job.name);
    jobLog("start", { periodKey, attempt: claimed.attempts });
    try {
      const summary = await job.run({ env, now, periodKey, log: jobLog });
      await db
        .update(customJobRuns)
        .set({
          status: "succeeded",
          finishedAt: isoNow(),
          summaryJson: summary ? JSON.stringify(summary) : null,
        })
        .where(eq(customJobRuns.id, claimed.id));
      jobLog("done", summary ?? undefined);
      outcomes.push({ job: job.name, periodKey, status: "succeeded" });
    } catch (error) {
      const message = errorMessage(error);
      await db
        .update(customJobRuns)
        .set({ status: "failed", finishedAt: isoNow(), error: message })
        .where(eq(customJobRuns.id, claimed.id));
      console.error(`[custom:${job.name}] failed`, error);
      outcomes.push({ job: job.name, periodKey, status: "failed" });
    }
  }

  return outcomes;
}

/** Force a single job to run now for its current period, ignoring the ledger's
 *  "already succeeded" rule. Used by the manual /run endpoint. */
export async function runJobNow(
  env: Cloudflare.Env,
  job: JobDefinition,
  now: Date,
) {
  const periodKey = job.due(now) ?? `manual-${now.toISOString()}`;
  const log = createLogger(job.name);
  const summary = await job.run({ env, now, periodKey, log });
  return { job: job.name, periodKey, summary: summary ?? null };
}
