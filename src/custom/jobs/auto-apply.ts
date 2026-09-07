// The autonomy the owner opted into: for projects with "auto-apply safe moves"
// switched on AND a domain the SEO edge Worker covers, open safe-tier
// title/meta moves become edge rules without asking. Everything else about
// the loop is unchanged — the verification crawl checks the live page the
// next morning, IndexNow gets pinged, and a 28-day verdict follows. Risky
// moves never come near this path.
import {
  mergeRules,
  rulesFromSnippet,
  rulesKvKey,
  EMPTY_RULESET,
  type EdgeRuleSet,
} from "@/custom/edge/rules";
import { parseJson } from "@/custom/lib/json";
import { errorMessage } from "@/custom/lib/log";
import { isoNow } from "@/custom/lib/time";
import { listIntelProjects } from "@/custom/intel/context";
import { MovesRepository } from "@/custom/moves/repository";
import { notify } from "@/custom/notify";
import { SettingsRepository } from "@/custom/settings/repository";
import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

// Gentle by design: a site changes a little every night, not all at once.
const MAX_PER_PROJECT_PER_DAY = 5;
// Only these produce pure title/meta edits the edge can carry.
const AUTO_SOURCES = new Set(["striking_distance", "audit"]);

function hostOf(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function edgeHosts(env: Cloudflare.Env): Set<string> {
  return new Set(
    (env.CUSTOM_EDGE_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const autoApplyJob: JobDefinition = {
  name: "auto_apply",
  due: dailyAfter(9, 15),
  run: async ({ env, log }) => {
    const covered = edgeHosts(env);
    if (covered.size === 0) return { skipped: "no edge hosts configured" };

    const projects = await listIntelProjects();
    let applied = 0;

    for (const project of projects) {
      if (!project.domain) continue;
      const host = hostOf(project.domain);
      if (!covered.has(host) && !covered.has(`www.${host}`)) continue;

      const settings = await SettingsRepository.getProject(project.id);
      if (!settings.autoApplySafe) continue;

      try {
        const open = await MovesRepository.listOpenForProject(project.id, 50);
        const candidates = open
          .filter(
            (move) =>
              move.riskTier === "safe" &&
              AUTO_SOURCES.has(move.source) &&
              move.snippet &&
              move.targetUrl &&
              hostOf(move.targetUrl) === host,
          )
          .slice(0, MAX_PER_PROJECT_PER_DAY);
        if (candidates.length === 0) continue;

        const kvKey = rulesKvKey(host);
        const current = parseJson<EdgeRuleSet>(
          await env.KV.get(kvKey),
          EMPTY_RULESET,
        );
        if (current.kill) {
          log("edge killed; not applying", { host });
          continue;
        }

        const appliedTitles: string[] = [];
        let ruleSet = current;
        for (const move of candidates) {
          const rules = rulesFromSnippet({
            moveId: move.id,
            targetUrl: move.targetUrl ?? "",
            snippet: move.snippet ?? "",
            now: isoNow(),
          });
          if (rules.length === 0) continue;
          ruleSet = mergeRules(ruleSet, rules);
          await MovesRepository.markApplied(move.id);
          appliedTitles.push(move.title);
        }
        if (appliedTitles.length === 0) continue;

        await env.KV.put(kvKey, JSON.stringify(ruleSet));
        applied += appliedTitles.length;

        await notify(env, {
          organizationId: project.organizationId,
          projectId: project.id,
          kind: "event",
          title: `Auto-applied ${appliedTitles.length} safe fix${appliedTitles.length === 1 ? "" : "es"} — ${host}`,
          body:
            appliedTitles.map((title) => `- ${title}`).join("\n") +
            "\n\nLive at the edge now; each page gets a verification check tomorrow morning and a before/after verdict in 28 days. Turn this off any time in Settings → Moves.",
          url: `${env.CUSTOM_APP_URL ?? ""}/moves`,
        });
      } catch (error) {
        log("auto-apply failed", {
          project: project.name,
          error: errorMessage(error),
        });
      }
    }

    return { applied };
  },
};
