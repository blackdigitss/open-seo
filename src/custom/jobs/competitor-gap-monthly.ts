// Monthly: what do the competitors in project memory rank for that we don't?
// The best gaps become opening Moves with a content brief attached, and the
// whole run is snapshotted so next month's diff has a baseline.
import { createDataforseoClient } from "@/server/lib/dataforseo/client";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { canSpend, dataforseoConfigured } from "@/custom/budget";
import { errorMessage } from "@/custom/lib/log";
import { draftContentBrief } from "@/custom/moves/drafts";
import { MovesRepository } from "@/custom/moves/repository";
import { scoreMove, DEFAULT_ECONOMICS } from "@/custom/moves/score";
import { SettingsRepository } from "@/custom/settings/repository";
import { billingContextFor, listIntelProjects } from "@/custom/intel/context";
import { diffGaps, mergeGaps, type RankedRow } from "@/custom/intel/gaps";
import { SnapshotsRepository } from "@/custom/intel/snapshots";
import type { JobDefinition } from "./runner";
import { monthlyOn } from "./schedule";

const ROWS_PER_DOMAIN = 200;
const MAX_COMPETITORS = 3;
// ranked_keywords bills ~$0.11 per 100-row page.
const ESTIMATE_PER_DOMAIN_USD = 0.25;

type LabsClient = ReturnType<typeof createDataforseoClient>["domain"];

async function rankedRows(
  labs: LabsClient,
  target: string,
  locationCode: number,
  languageCode: string,
): Promise<RankedRow[]> {
  const page = await labs.rankedKeywords({
    target,
    locationCode,
    languageCode,
    limit: ROWS_PER_DOMAIN,
    orderBy: ["keyword_data.keyword_info.search_volume,desc"],
  });
  return page.items.map((item) => ({
    keyword: item.keyword ?? "",
    position:
      item.ranked_serp_element?.serp_item?.rank_absolute ??
      item.ranked_serp_element?.rank_absolute ??
      null,
    volume: item.keyword_data?.keyword_info?.search_volume ?? null,
  }));
}

export const competitorGapMonthlyJob: JobDefinition = {
  name: "competitor_gap_monthly",
  due: monthlyOn(3, 8),
  run: async ({ env, now, log }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };

    const projects = await listIntelProjects();
    let movesCreated = 0;
    let snapshots = 0;

    for (const project of projects) {
      if (!project.domain) continue;
      try {
        const competitors = (
          await ProjectContextRepository.listCompetitors(project.id)
        )
          .map((row) => row.domain)
          .slice(0, MAX_COMPETITORS);
        if (competitors.length === 0) continue;

        const estimate = ESTIMATE_PER_DOMAIN_USD * (competitors.length + 1);
        const spend = await canSpend(project.organizationId, estimate, now);
        if (!spend.allowed) {
          log("budget", { project: project.name, reason: spend.reason });
          continue;
        }

        const labs = createDataforseoClient(billingContextFor(project)).domain;
        const ours = await rankedRows(
          labs,
          project.domain,
          project.locationCode,
          project.languageCode,
        );

        const allGaps = [];
        for (const competitor of competitors) {
          const theirs = await rankedRows(
            labs,
            competitor,
            project.locationCode,
            project.languageCode,
          );
          allGaps.push(...diffGaps({ ours, competitor, theirs, limit: 15 }));
        }
        const gaps = mergeGaps(allGaps, 10);

        await SnapshotsRepository.insert({
          projectId: project.id,
          kind: "competitor_gap",
          summary: {
            competitors,
            gapCount: gaps.length,
            topGaps: gaps.slice(0, 5),
          },
          payload: { gaps: allGaps },
        });
        snapshots += 1;

        const settings = await SettingsRepository.getProject(project.id);
        const economics = SettingsRepository.economicsFor(settings, null);
        const maxVolume = Math.max(1, ...gaps.map((gap) => gap.volume));

        for (const gap of gaps) {
          const scored = scoreMove({
            ordinal: gap.volume / maxVolume,
            // A new page rarely takes more than a sliver of a term's volume.
            upsideClicks: Math.round(gap.volume * 0.05),
            economics: economics ?? DEFAULT_ECONOMICS,
            pageRole: null,
          });
          const brief = await draftContentBrief(env, {
            query: gap.keyword,
            businessName: project.domain,
            voice: "",
            competitor: gap.competitor,
          });
          const { created } = await MovesRepository.upsert({
            projectId: project.id,
            dedupeKey: `gap:${gap.keyword}`,
            type: "opening",
            source: "opportunity",
            title: `Publish a page for "${gap.keyword}"`,
            hypothesis: `A page answering "${gap.keyword}" wins traffic ${gap.competitor} already gets and this site doesn't compete for.`,
            reason: `${gap.volume.toLocaleString()}/mo · ${gap.competitor} ranks #${gap.competitorPosition} · we don't rank`,
            evidence: {
              query: gap.keyword,
              competitor: gap.competitor,
              competitorPosition: gap.competitorPosition,
              volume: gap.volume,
              verify: { kind: "none" },
            },
            targetQuery: gap.keyword,
            draft: brief,
            riskTier: "safe",
            score: scored.score,
            scoreInputs: scored.inputs,
            valueBucket: scored.valueBucket,
          });
          if (created) movesCreated += 1;
        }
      } catch (error) {
        log("gap run failed", {
          project: project.name,
          error: errorMessage(error),
        });
      }
    }

    return { projects: projects.length, snapshots, movesCreated };
  },
};
