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
const CHUNK = 100;

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

export const gscAppendJob: JobDefinition = {
  name: "gsc_append",
  due: dailyAfter(8),
  run: async ({ log }) => {
    const day = shiftDays(dayKey(new Date()), -GSC_LAG_DAYS);
    const rows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(sql`${projects.archivedAt} is null`);

    let projectsAppended = 0;
    let rowsWritten = 0;
    let skipped = 0;

    for (const project of rows) {
      try {
        const [existing] = await db
          .select({ count: sql<number>`count(*)` })
          .from(customGscDaily)
          .where(eq(customGscDaily.projectId, project.id));
        const isFirstRun = Number(existing?.count ?? 0) === 0;

        if (isFirstRun) {
          // One-off: fill the trailing window so decay has a baseline today
          // rather than in a month.
          for (let offset = BACKFILL_DAYS - 1; offset >= 0; offset--) {
            rowsWritten += await appendDay(project.id, shiftDays(day, -offset));
          }
          log("backfilled", { project: project.name, days: BACKFILL_DAYS });
        } else {
          const [already] = await db
            .select({ count: sql<number>`count(*)` })
            .from(customGscDaily)
            .where(
              and(
                eq(customGscDaily.projectId, project.id),
                eq(customGscDaily.date, day),
              ),
            );
          if (Number(already?.count ?? 0) > 0) continue;
          rowsWritten += await appendDay(project.id, day);
        }
        projectsAppended += 1;
      } catch (error) {
        if (error instanceof GscNotConnectedError) {
          skipped += 1;
          continue;
        }
        // One project's bad grant must not stop the rest.
        log("failed", {
          project: project.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { day, projectsAppended, rowsWritten, skipped };
  },
};
