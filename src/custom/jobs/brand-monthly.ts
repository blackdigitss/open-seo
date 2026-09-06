// Monthly AI-visibility snapshot. Upstream's Brand Lookup is stateless — run
// it twice a month apart and the first result is gone (#266 upstream). This
// persists each run so the trend exists, and speaks up only when share of
// voice actually moved.
import { getBrandLookup } from "@/server/features/ai-search/services/brandLookup";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { canSpend, dataforseoConfigured } from "@/custom/budget";
import { errorMessage } from "@/custom/lib/log";
import { monthKey } from "@/custom/lib/time";
import {
  billingContextFor,
  listIntelProjects,
  notifyBudgetPauseOnce,
} from "@/custom/intel/context";
import {
  pointsMoved,
  SnapshotsRepository,
  summaryNumber,
} from "@/custom/intel/snapshots";
import { notify } from "@/custom/notify";
import type { JobDefinition } from "./runner";
import { monthlyOn } from "./schedule";

// Brand lookup with competitors is upstream's priciest single call.
const ESTIMATE_USD = 1.1;
const NOTIFY_POINTS = 10;

type BrandSummary = {
  query: string;
  competitors: string[];
  sharePct: number | null;
  totalMentions: number | null;
  totalAiSearchVolume: number | null;
  mentionsByPlatform: Record<string, number | null>;
  topSourceDomains: string[];
};

function summarize(
  query: string,
  competitors: string[],
  result: Awaited<ReturnType<typeof getBrandLookup>>,
): BrandSummary {
  const target = result.shareOfVoice?.entries.find((entry) => entry.isTarget);
  const mentionsByPlatform: Record<string, number | null> = {};
  for (const platform of result.perPlatform) {
    mentionsByPlatform[platform.platform] = platform.mentions;
  }
  const topSourceDomains = [
    ...new Set(
      result.topPages
        .map((page) => page.domain)
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ].slice(0, 10);
  return {
    query,
    competitors,
    sharePct: target?.sharePct ?? null,
    totalMentions: result.totalMentions,
    totalAiSearchVolume: result.totalAiSearchVolume,
    mentionsByPlatform,
    topSourceDomains,
  };
}

export const brandMonthlyJob: JobDefinition = {
  name: "brand_monthly",
  due: monthlyOn(2, 8),
  run: async ({ env, now, log }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };

    const projects = await listIntelProjects();
    let taken = 0;
    let skipped = 0;

    for (const project of projects) {
      if (!project.domain) continue;
      const spend = await canSpend(project.organizationId, ESTIMATE_USD, now);
      if (!spend.allowed) {
        skipped += 1;
        if (
          await notifyBudgetPauseOnce(env, {
            organizationId: project.organizationId,
            job: "brand_monthly",
            monthKey: monthKey(now),
            reason: spend.reason ?? "budget",
          })
        ) {
          await notify(env, {
            organizationId: project.organizationId,
            kind: "system",
            title: "Monthly brand snapshot paused by budget",
            body: `${spend.reason}. Raise the budget in Settings → Moves to resume.`,
            url: `${env.CUSTOM_APP_URL ?? ""}/settings/moves`,
          });
        }
        continue;
      }

      try {
        const competitors = (
          await ProjectContextRepository.listCompetitors(project.id)
        )
          .map((row) => row.domain)
          .slice(0, 3);

        const result = await getBrandLookup(
          {
            projectId: project.id,
            query: project.domain,
            competitors,
            locationCode: project.locationCode,
            languageCode: project.languageCode,
          },
          billingContextFor(project),
        );

        const previous = await SnapshotsRepository.latest(
          project.id,
          "brand_lookup",
        );
        const summary = summarize(project.domain, competitors, result);
        await SnapshotsRepository.insert({
          projectId: project.id,
          kind: "brand_lookup",
          summary,
          // The full result replays the whole report later without re-paying.
          payload: { result },
        });
        taken += 1;

        const previousShare = summaryNumber(previous, "sharePct");
        const moved = pointsMoved(previousShare, summary.sharePct);
        if (moved !== null && moved >= NOTIFY_POINTS) {
          const direction =
            (summary.sharePct ?? 0) > (previousShare ?? 0) ? "up" : "down";
          await notify(env, {
            organizationId: project.organizationId,
            projectId: project.id,
            kind: "event",
            title: `AI share of voice ${direction} ${Math.round(moved)} points — ${project.domain}`,
            body: `${previousShare?.toFixed(0) ?? "?"}% → ${summary.sharePct?.toFixed(0) ?? "?"}% since ${previous?.takenAt.slice(0, 10)}. Full history is on the project's History page.`,
            url: `${env.CUSTOM_APP_URL ?? ""}/p/${project.id}/history`,
          });
        }
      } catch (error) {
        log("brand lookup failed", {
          project: project.name,
          error: errorMessage(error),
        });
      }
    }

    return { projects: projects.length, taken, skipped };
  },
};
