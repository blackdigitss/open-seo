// Monthly search volume for the brand itself — the cheapest single indicator
// that marketing outside SEO (word of mouth, reviews, ads) is compounding.
import { createDataforseoClient } from "@/server/lib/dataforseo/client";
import { canSpend, dataforseoConfigured } from "@/custom/budget";
import { errorMessage } from "@/custom/lib/log";
import { billingContextFor, listIntelProjects } from "@/custom/intel/context";
import {
  relativeChange,
  SnapshotsRepository,
  summaryNumber,
} from "@/custom/intel/snapshots";
import { brandTerms } from "@/custom/intel/brand-terms";
import { notify } from "@/custom/notify";
import type { JobDefinition } from "./runner";
import { monthlyOn } from "./schedule";

const ESTIMATE_USD = 0.06;
const NOTIFY_CHANGE = 0.25;

export const brandVolumeMonthlyJob: JobDefinition = {
  name: "brand_volume_monthly",
  due: monthlyOn(4, 8),
  run: async ({ env, now, log }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };

    const projects = await listIntelProjects();
    let taken = 0;

    for (const project of projects) {
      const spend = await canSpend(project.organizationId, ESTIMATE_USD, now);
      if (!spend.allowed) continue;

      try {
        const terms = brandTerms(project.name, project.domain);
        if (terms.length === 0) continue;
        const client = createDataforseoClient(billingContextFor(project));
        const items = await client.keywords.adsSearchVolume({
          keywords: terms,
          locationCode: project.locationCode,
          languageCode: project.languageCode,
        });

        const byTerm = items.map((item) => ({
          term: item.keyword ?? "",
          volume: item.search_volume ?? 0,
        }));
        const total = byTerm.reduce((sum, row) => sum + row.volume, 0);

        const previous = await SnapshotsRepository.latest(
          project.id,
          "brand_volume",
        );
        await SnapshotsRepository.insert({
          projectId: project.id,
          kind: "brand_volume",
          summary: { total, terms: byTerm },
          payload: { items },
        });
        taken += 1;

        const previousTotal = summaryNumber(previous, "total");
        const change = relativeChange(previousTotal, total);
        if (change !== null && Math.abs(change) >= NOTIFY_CHANGE) {
          await notify(env, {
            organizationId: project.organizationId,
            projectId: project.id,
            kind: "event",
            title: `Brand searches ${change > 0 ? "up" : "down"} ${Math.round(Math.abs(change) * 100)}% — ${project.name}`,
            body: `${previousTotal}/mo → ${total}/mo since ${previous?.takenAt.slice(0, 10)}. People searching your name directly is the clearest sign the brand itself is moving.`,
            url: `${env.CUSTOM_APP_URL ?? ""}/p/${project.id}/history`,
          });
        }
      } catch (error) {
        log("brand volume failed", {
          project: project.name,
          error: errorMessage(error),
        });
      }
    }

    return { projects: projects.length, taken };
  },
};
