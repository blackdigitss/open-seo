// New pages get told to the search engines the day they appear, not whenever
// the crawler wanders back. Daily: diff the sitemap against what we've seen,
// skip anything marked noindex (sales pages stay private), and submit the
// rest to IndexNow automatically — free, and explicitly wanted automatic.
import { indexNowKeyIsLive, pingIndexNow } from "@/custom/apply/indexnow";
import { fetchPageFacts } from "@/custom/apply/page-check";
import { parseJson } from "@/custom/lib/json";
import { errorMessage } from "@/custom/lib/log";
import { listIntelProjects } from "@/custom/intel/context";
import { readSitemapUrls } from "@/custom/intel/sitemap";
import { GscService } from "@/server/features/gsc/services/GscService";
import { notify } from "@/custom/notify";
import { SettingsRepository } from "@/custom/settings/repository";
import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

const MAX_NEW_PER_RUN = 10;

function hostOf(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function seenKey(projectId: string): string {
  return `custom:sitemap_seen:${projectId}`;
}

/** Google's URL-inspection verdicts, keyed by URL; empty when GSC isn't
 *  connected or the grant is broken (the ping already happened either way). */
async function googleCoverage(
  projectId: string,
  urls: string[],
): Promise<Map<string, string>> {
  const coverage = new Map<string, string>();
  if (urls.length === 0) return coverage;
  try {
    const inspection = await GscService.inspectUrls({ projectId, urls });
    for (const entry of inspection.results) {
      const state = Reflect.get(
        Reflect.get(entry.result ?? {}, "indexStatusResult") ?? {},
        "coverageState",
      );
      if (typeof state === "string") coverage.set(entry.url, state);
    }
  } catch {
    // No connection: nothing to report.
  }
  return coverage;
}

export const indexingWatchJob: JobDefinition = {
  name: "indexing_watch",
  due: dailyAfter(10, 30),
  run: async ({ env, log }) => {
    const projects = await listIntelProjects();
    let submitted = 0;
    let noindexSkipped = 0;

    for (const project of projects) {
      if (!project.domain) continue;
      try {
        const host = hostOf(project.domain);
        const urls = await readSitemapUrls(host);
        if (urls === null) continue;

        const seen = new Set(
          parseJson<string[]>(await env.KV.get(seenKey(project.id)), []),
        );
        const fresh = urls.filter((url) => !seen.has(url));

        // First sight of this sitemap is a baseline, not a batch of news.
        if (seen.size === 0) {
          await env.KV.put(seenKey(project.id), JSON.stringify(urls));
          log("baseline", { project: project.name, urls: urls.length });
          continue;
        }
        if (fresh.length === 0) continue;

        const settings = await SettingsRepository.getProject(project.id);
        const key = settings.indexnowKey;
        const keyLive = key ? await indexNowKeyIsLive(host, key) : false;

        const classify = async (
          url: string,
        ): Promise<"ok" | "skip" | "retry"> => {
          try {
            const facts = await fetchPageFacts(url);
            const robots = facts.robotsMeta?.toLowerCase() ?? "";
            if (facts.status !== 200 || robots.includes("noindex"))
              return "skip";
            return "ok";
          } catch {
            return "retry";
          }
        };

        const indexable: string[] = [];
        for (const url of fresh.slice(0, MAX_NEW_PER_RUN)) {
          const verdict = await classify(url);
          if (verdict === "ok") indexable.push(url);
          else if (verdict === "skip") noindexSkipped += 1;
          // "retry": leave it unseen so tomorrow tries again.
          else fresh.splice(fresh.indexOf(url), 1);
        }

        if (indexable.length > 0 && key && keyLive) {
          const ping = await pingIndexNow({ host, key, urls: indexable });
          if (ping.ok) submitted += indexable.length;
        }

        // Google has no general submit API; what it does give us, free, is
        // the URL Inspection verdict — so the notification says where each
        // new page stands instead of leaving it to hope.
        const coverage = await googleCoverage(project.id, indexable);

        await env.KV.put(
          seenKey(project.id),
          JSON.stringify([...seen, ...fresh]),
        );

        if (indexable.length > 0) {
          await notify(env, {
            organizationId: project.organizationId,
            projectId: project.id,
            kind: "event",
            title: `${indexable.length} new page${indexable.length === 1 ? "" : "s"} spotted — ${host}`,
            body:
              indexable
                .map((url) => {
                  const state = coverage.get(url);
                  return `- ${url}${state ? ` — Google: ${state}` : ""}`;
                })
                .join("\n") +
              (key && keyLive
                ? "\n\nSubmitted to IndexNow (Bing and friends hear about them today; Google finds them via the sitemap and the coverage above)."
                : "\n\nAdd the IndexNow key file (see your Moves) and new pages get submitted automatically."),
          });
        }
      } catch (error) {
        log("indexing watch failed", {
          project: project.name,
          error: errorMessage(error),
        });
      }
    }

    return { projects: projects.length, submitted, noindexSkipped };
  },
};
