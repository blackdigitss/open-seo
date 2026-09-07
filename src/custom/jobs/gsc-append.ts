// Search Console keeps 16 months and the app fetches it live and throws it
// away. This appends the finalized day to our own tables so decay, verdicts
// and "what worked" have history the moment they need it.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { customGscDaily, customGscQueryDaily } from "@/db/custom/schema";
import { GscService } from "@/server/features/gsc/services/GscService";
import { GscNotConnectedError } from "@/server/lib/gscErrors";
import { dayKey, shiftDays } from "@/custom/lib/time";
import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

const GSC_LAG_DAYS = 3;
const BACKFILL_DAYS = 28;
// A Worker invocation has a subrequest budget; a full 28-day backfill (2 GSC
// calls + dozens of D1 inserts per day) blows past it. Fill at most this many
// missing days per run — successive cron ticks converge on complete history.
const MAX_DAYS_PER_RUN = 10;
// D1 allows at most 100 bound parameters per statement; these rows carry 7
// columns each, so 12 rows (84 params) per INSERT is the safe chunk.
const CHUNK = 12;

async function appendDay(projectId: string, day: string): Promise<number> {
  const [pageRows, queryRows] = await Promise.all([
    GscService.getPerformance({
      projectId,
      dimensions: ["page"],
      startDate: day,
      endDate: day,
      rowLimit: 1000,
      dataState: "final",
    }),
    GscService.getPerformance({
      projectId,
      dimensions: ["query", "page"],
      startDate: day,
      endDate: day,
      rowLimit: 1000,
      dataState: "final",
    }),
  ]);

  const pageValues = pageRows.rows.flatMap((row) => {
    const page = row.keys?.[0];
    if (!page) return [];
    return [
      {
        projectId,
        date: day,
        page,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
    ];
  });

  const queryValues = queryRows.rows.flatMap((row) => {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) return [];
    return [
      {
        projectId,
        date: day,
        page,
        query,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
      },
    ];
  });

  for (let i = 0; i < pageValues.length; i += CHUNK) {
    await db
      .insert(customGscDaily)
      .values(pageValues.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }
  for (let i = 0; i < queryValues.length; i += CHUNK) {
    await db
      .insert(customGscQueryDaily)
      .values(queryValues.slice(i, i + CHUNK))
      .onConflictDoNothing();
  }

  return pageValues.length + queryValues.length;
}

/** The dates missing from the trailing window, oldest first. */
async function missingDays(
  projectId: string,
  newest: string,
): Promise<string[]> {
  const present = new Set(
    (
      await db
        .selectDistinct({ date: customGscDaily.date })
        .from(customGscDaily)
        .where(eq(customGscDaily.projectId, projectId))
    ).map((row) => row.date),
  );
  const missing: string[] = [];
  for (let offset = BACKFILL_DAYS - 1; offset >= 0; offset--) {
    const day = shiftDays(newest, -offset);
    if (!present.has(day)) missing.push(day);
  }
  return missing;
}

export const gscAppendJob: JobDefinition = {
  name: "gsc_append",
  due: dailyAfter(8),
  run: async ({ log }) => {
    const newest = shiftDays(dayKey(new Date()), -GSC_LAG_DAYS);
    const rows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(sql`${projects.archivedAt} is null`);

    let daysAppended = 0;
    let rowsWritten = 0;
    let skipped = 0;
    let remaining = 0;

    for (const project of rows) {
      try {
        const missing = await missingDays(project.id, newest);
        const batch = missing.slice(0, MAX_DAYS_PER_RUN);
        remaining += missing.length - batch.length;
        for (const day of batch) {
          rowsWritten += await appendDay(project.id, day);
          daysAppended += 1;
        }
      } catch (error) {
        if (error instanceof GscNotConnectedError) {
          skipped += 1;
          continue;
        }
        // One project's bad grant must not stop the rest; whatever this run
        // managed is kept and the next tick resumes at the next missing day.
        log("failed", {
          project: project.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { newest, daysAppended, rowsWritten, skipped, remaining };
  },
};
