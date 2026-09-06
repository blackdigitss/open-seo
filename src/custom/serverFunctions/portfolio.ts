import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { MovesRepository } from "@/custom/moves/repository";
import { NotificationsRepository } from "@/custom/notify/inapp";

type PortfolioProject = {
  id: string;
  name: string;
  domain: string | null;
  openCount: number;
  appliedCount: number;
  concludedCount: number;
  topMove: {
    id: string;
    title: string;
    reason: string;
    valueBucket: "low" | "mid" | "high" | null;
    riskTier: "safe" | "risky";
    score: number;
  } | null;
};

/** Everything the home page needs, in three queries rather than one per
 *  project. */
export const getPortfolio = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        domain: projects.domain,
      })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, context.organizationId),
          isNull(projects.archivedAt),
        ),
      );

    const [counts, openMoves, unread] = await Promise.all([
      MovesRepository.countByStatusForProjects(rows.map((row) => row.id)),
      MovesRepository.listForOrganization(context.organizationId, {
        statuses: ["open"],
        limit: 500,
      }),
      NotificationsRepository.unreadCount(context.organizationId),
    ]);

    const topByProject = new Map<string, PortfolioProject["topMove"]>();
    for (const move of openMoves) {
      // listForOrganization already sorts by score descending.
      if (topByProject.has(move.projectId)) continue;
      topByProject.set(move.projectId, {
        id: move.id,
        title: move.title,
        reason: move.reason,
        valueBucket: move.valueBucket,
        riskTier: move.riskTier,
        score: move.score,
      });
    }

    const countFor = (projectId: string, statuses: string[]) =>
      counts
        .filter(
          (row) => row.projectId === projectId && statuses.includes(row.status),
        )
        .reduce((sum, row) => sum + Number(row.count), 0);

    const portfolio: PortfolioProject[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      openCount: countFor(row.id, ["open"]),
      appliedCount: countFor(row.id, ["applied", "verified", "verify_failed"]),
      concludedCount: countFor(row.id, ["concluded"]),
      topMove: topByProject.get(row.id) ?? null,
    }));

    // What needs you first.
    portfolio.sort(
      (a, b) => (b.topMove?.score ?? -1) - (a.topMove?.score ?? -1),
    );

    return { projects: portfolio, unreadNotifications: unread };
  });
