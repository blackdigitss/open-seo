// Makes sure every project with keywords worth watching has a weekly rank
// tracker at the depth the striking-distance band needs. Creation itself is
// free; upstream's own cron runs the checks and pays per check, so this only
// sets up projects that have nothing yet and never touches a config the owner
// made.
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { customGscQueryDaily } from "@/db/custom/schema";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { dataforseoConfigured } from "@/custom/budget";
import { errorMessage } from "@/custom/lib/log";
import { dayKey, shiftDays } from "@/custom/lib/time";
import { listIntelProjects } from "@/custom/intel/context";
import { notify } from "@/custom/notify";
import type { JobDefinition } from "./runner";
import { weeklyOn } from "./schedule";

// Positions 11-20 are where openings live; depth 40 gives headroom.
const SERP_DEPTH = 40;
const MAX_KEYWORDS = 20;
// One weekly check for 20 keywords ≈ 20 × $0.0006 × 4 weeks ≈ $0.05/month —
// cheap enough that the budget guard would be noise here.

async function keywordsFor(projectId: string): Promise<string[]> {
  const saved = await KeywordResearchRepository.listSavedKeywordsByProject({
    projectId,
    pageSize: MAX_KEYWORDS,
  });
  const savedKeywords = saved.rows
    .map((entry) => entry.row.keyword)
    .filter(Boolean);
  if (savedKeywords.length > 0) return savedKeywords.slice(0, MAX_KEYWORDS);

  // Fall back to what Search Console says people actually find them for.
  const since = shiftDays(dayKey(new Date()), -28);
  const rows = await db
    .select({
      query: customGscQueryDaily.query,
      impressions: sql<number>`sum(${customGscQueryDaily.impressions})`,
    })
    .from(customGscQueryDaily)
    .where(
      and(
        eq(customGscQueryDaily.projectId, projectId),
        gte(customGscQueryDaily.date, since),
      ),
    )
    .groupBy(customGscQueryDaily.query)
    .orderBy(desc(sql`sum(${customGscQueryDaily.impressions})`))
    .limit(MAX_KEYWORDS);
  return rows.map((row) => row.query);
}

export const rankWeeklyJob: JobDefinition = {
  name: "rank_weekly",
  due: weeklyOn(3, 8),
  run: async ({ env, log }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };

    const projects = await listIntelProjects();
    let created = 0;

    for (const project of projects) {
      if (!project.domain) continue;
      try {
        const configs = await RankTrackingRepository.getConfigsForProject(
          project.id,
        );
        // Any existing config — scheduled or manual — is the owner's setup;
        // leave it alone.
        if (configs.length > 0) continue;

        const keywords = await keywordsFor(project.id);
        if (keywords.length === 0) continue;

        const config = await RankTrackingService.createConfig({
          projectId: project.id,
          projectMarket: {
            locationCode: project.locationCode,
            languageCode: project.languageCode,
          },
          domain: project.domain,
          devices: "mobile",
          serpDepth: SERP_DEPTH,
          scheduleInterval: "weekly",
        });
        await RankTrackingService.addKeywords(
          config.id,
          project.id,
          keywords,
          // Scheduled setup under the fork's budget model; upstream's ceiling
          // check is a second guard on top.
          { kind: "credit_ceiling" },
        );
        created += 1;

        await notify(env, {
          organizationId: project.organizationId,
          projectId: project.id,
          kind: "system",
          title: `Rank tracking set up — ${project.domain}`,
          body: `Now watching ${keywords.length} keywords weekly at depth ${SERP_DEPTH} (≈$0.05/month). Edit them under Rank Tracking.`,
          url: `${env.CUSTOM_APP_URL ?? ""}/p/${project.id}/rank-tracking`,
        });
      } catch (error) {
        log("rank setup failed", {
          project: project.name,
          error: errorMessage(error),
        });
      }
    }

    return { projects: projects.length, created };
  },
};
