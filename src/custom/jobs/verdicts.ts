// Twenty-eight days after a Move was applied, say whether it worked. Reads our
// own persisted Search Console history first and falls back to a live query
// when the table doesn't cover the window yet.
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { customGscDaily } from "@/db/custom/schema";
import { GscService } from "@/server/features/gsc/services/GscService";
import { buildVerdict } from "@/custom/apply/verdict";
import { errorMessage } from "@/custom/lib/log";
import { dayKey, lastYearWindow, shiftDays } from "@/custom/lib/time";
import { MovesRepository } from "@/custom/moves/repository";
import { notify } from "@/custom/notify";
import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

const WINDOW_DAYS = 28;
/** Fewer distinct days than this and the table can't be trusted for the window. */
const MIN_COVERAGE_DAYS = 20;

type Window = { start: string; end: string };

function pageVariants(url: string): string[] {
  const trimmed = url.replace(/\/+$/, "");
  return [...new Set([url, trimmed, `${trimmed}/`])];
}

async function clicksFromTable(
  projectId: string,
  window: Window,
  page: string | null,
): Promise<{ clicks: number; days: number }> {
  const conditions = [
    eq(customGscDaily.projectId, projectId),
    gte(customGscDaily.date, window.start),
    lte(customGscDaily.date, window.end),
  ];
  if (page) conditions.push(inArray(customGscDaily.page, pageVariants(page)));

  const [row] = await db
    .select({
      clicks: sql<number>`coalesce(sum(${customGscDaily.clicks}), 0)`,
      days: sql<number>`count(distinct ${customGscDaily.date})`,
    })
    .from(customGscDaily)
    .where(and(...conditions));
  return { clicks: Number(row?.clicks ?? 0), days: Number(row?.days ?? 0) };
}

async function clicksLive(
  projectId: string,
  window: Window,
  page: string | null,
): Promise<number | null> {
  try {
    const performance = await GscService.getPerformance({
      projectId,
      dimensions: page ? ["page"] : [],
      startDate: window.start,
      endDate: window.end,
      rowLimit: 1000,
    });
    if (!page) {
      return performance.rows.reduce((sum, row) => sum + row.clicks, 0);
    }
    const wanted = new Set(pageVariants(page));
    return performance.rows
      .filter((row) => row.keys?.[0] && wanted.has(row.keys[0]))
      .reduce((sum, row) => sum + row.clicks, 0);
  } catch {
    return null;
  }
}

/** Our table when it covers the window, a live query when it doesn't. */
async function clicksFor(
  projectId: string,
  window: Window,
  page: string | null,
): Promise<number | null> {
  const stored = await clicksFromTable(projectId, window, page);
  if (stored.days >= MIN_COVERAGE_DAYS) return stored.clicks;
  const live = await clicksLive(projectId, window, page);
  return live ?? (stored.days > 0 ? stored.clicks : null);
}

export const verdictsJob: JobDefinition = {
  name: "verdicts",
  due: dailyAfter(9, 30),
  run: async ({ env, now, log }) => {
    const due = await MovesRepository.listDueForVerdict(dayKey(now));
    let concluded = 0;

    for (const { move, organizationId, projectName } of due) {
      if (!move.appliedAt) continue;
      try {
        const appliedDay = move.appliedAt.slice(0, 10);
        const after: Window = {
          start: shiftDays(appliedDay, 1),
          end: shiftDays(appliedDay, WINDOW_DAYS),
        };
        const before: Window = {
          start: shiftDays(appliedDay, -WINDOW_DAYS),
          end: shiftDays(appliedDay, -1),
        };
        const lastYearAfterWindow = lastYearWindow(after.start, after.end);
        const lastYearBeforeWindow = lastYearWindow(before.start, before.end);
        const page = move.targetUrl;

        const [beforeClicks, afterClicks, lyBefore, lyAfter] =
          await Promise.all([
            clicksFor(move.projectId, before, page),
            clicksFor(move.projectId, after, page),
            clicksFor(move.projectId, lastYearBeforeWindow, page),
            clicksFor(move.projectId, lastYearAfterWindow, page),
          ]);

        const verdict = buildVerdict({
          before: beforeClicks ?? 0,
          after: afterClicks ?? 0,
          lastYearBefore: lyBefore,
          lastYearAfter: lyAfter,
          computedAt: now.toISOString(),
        });

        await MovesRepository.conclude(move.id, verdict);
        concluded += 1;

        await notify(env, {
          organizationId,
          projectId: move.projectId,
          kind: "verdict",
          title: `${verdict.reading === "improved" ? "Worked" : verdict.reading === "declined" ? "Went backwards" : "No clear change"}: ${move.title}`,
          body: `${projectName} · applied ${appliedDay}\n\n${verdict.summary}`,
          moveId: move.id,
        });
      } catch (error) {
        log("verdict failed", {
          move: move.title,
          error: errorMessage(error),
        });
      }
    }

    return { due: due.length, concluded };
  },
};
