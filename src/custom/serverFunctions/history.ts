import { createServerFn } from "@tanstack/react-start";
import { gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customDataforseoCalls } from "@/db/custom/schema";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import { SnapshotsRepository } from "@/custom/intel/snapshots";
import { monthKey } from "@/custom/lib/time";

/** Every dated analysis kept for a project — free to read forever. The
 *  summary crosses the wire as its stored JSON string: the server-fn
 *  serializer wants concrete types, and the client parses anyway. */
export const getProjectHistory = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context }) => {
    const rows = await SnapshotsRepository.listForProject(context.projectId);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      takenAt: row.takenAt,
      summaryJson: JSON.stringify(row.summary),
    }));
  });

/** Month-to-date DataForSEO spend, broken down by feature and by day. */
export const getSpendSummary = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    const monthStart = `${monthKey(new Date())}-01`;
    const [byFeature, byDay, [total]] = await Promise.all([
      db
        .select({
          feature: customDataforseoCalls.feature,
          costUsd: sql<number>`sum(${customDataforseoCalls.costUsd})`,
          calls: sql<number>`count(*)`,
        })
        .from(customDataforseoCalls)
        .where(gte(customDataforseoCalls.at, monthStart))
        .groupBy(customDataforseoCalls.feature)
        .orderBy(sql`sum(${customDataforseoCalls.costUsd}) desc`),
      db
        .select({
          day: sql<string>`substr(${customDataforseoCalls.at}, 1, 10)`,
          costUsd: sql<number>`sum(${customDataforseoCalls.costUsd})`,
        })
        .from(customDataforseoCalls)
        .where(gte(customDataforseoCalls.at, monthStart))
        .groupBy(sql`substr(${customDataforseoCalls.at}, 1, 10)`)
        .orderBy(sql`substr(${customDataforseoCalls.at}, 1, 10)`),
      db
        .select({
          costUsd: sql<number>`coalesce(sum(${customDataforseoCalls.costUsd}), 0)`,
          calls: sql<number>`count(*)`,
        })
        .from(customDataforseoCalls)
        .where(gte(customDataforseoCalls.at, monthStart)),
    ]);
    return {
      month: monthKey(new Date()),
      totalUsd: Number(total?.costUsd ?? 0),
      totalCalls: Number(total?.calls ?? 0),
      byFeature: byFeature.map((row) => ({
        feature: row.feature ?? "other",
        costUsd: Number(row.costUsd),
        calls: Number(row.calls),
      })),
      byDay: byDay.map((row) => ({
        day: row.day,
        costUsd: Number(row.costUsd),
      })),
    };
  });
