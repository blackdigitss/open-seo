// The morning after you mark a Move done, check the page actually says what
// the Move promised — then tell IndexNow. A fix you think you applied but
// didn't is worse than one you never started.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { fetchPageFacts } from "@/custom/apply/page-check";
import { evaluate } from "@/custom/apply/page-facts";
import { indexNowKeyIsLive, pingIndexNow } from "@/custom/apply/indexnow";
import { parseJson } from "@/custom/lib/json";
import { errorMessage } from "@/custom/lib/log";
import { MovesRepository } from "@/custom/moves/repository";
import type { VerifyExpectation } from "@/custom/moves/types";
import { notify } from "@/custom/notify";
import { SettingsRepository } from "@/custom/settings/repository";
import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

// Give a deploy time to land before calling a Move unverified.
const MIN_AGE_MS = 12 * 60 * 60 * 1000;

function hostOf(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;
  }
}

function describe(details: Record<string, unknown>): string {
  const expected = details.expected;
  const found = details.found;
  if (expected !== undefined && found !== undefined) {
    return `Expected ${JSON.stringify(expected)}, found ${JSON.stringify(found)}.`;
  }
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
}

export const verifyCrawlJob: JobDefinition = {
  name: "verify_crawl",
  due: dailyAfter(9),
  run: async ({ env, now, log }) => {
    const pending = await MovesRepository.listAwaitingVerification();
    let verified = 0;
    let failed = 0;
    let pinged = 0;

    for (const { move, organizationId } of pending) {
      const url = move.verifyUrl ?? move.targetUrl;
      if (!url) continue;
      if (
        move.appliedAt &&
        Date.parse(move.appliedAt) > now.getTime() - MIN_AGE_MS
      ) {
        continue;
      }

      try {
        const evidence = parseJson<{ verify?: VerifyExpectation }>(
          move.evidenceJson,
          {},
        );
        const facts = await fetchPageFacts(url);
        const result = evaluate(evidence.verify ?? { kind: "none" }, facts);
        await MovesRepository.setVerification(move.id, {
          ok: result.ok,
          details: { ...result.details, url, status: facts.status },
        });

        if (!result.ok) {
          failed += 1;
          await notify(env, {
            organizationId,
            projectId: move.projectId,
            kind: "event",
            title: `Couldn't verify: ${move.title}`,
            body: `${describe(result.details)}\n\nIf the change is live and this is wrong, reopen the move and mark it done again.`,
            moveId: move.id,
          });
          continue;
        }

        verified += 1;
        // Submitting the setup move's own key file would be circular.
        if (move.dedupeKey === "setup:indexnow" || !move.targetUrl) continue;

        const settings = await SettingsRepository.getProject(move.projectId);
        const [project] = await db
          .select({ domain: projects.domain })
          .from(projects)
          .where(eq(projects.id, move.projectId))
          .limit(1);
        const host = project?.domain ? hostOf(project.domain) : hostOf(url);
        if (!settings.indexnowKey || !host) continue;
        if (!(await indexNowKeyIsLive(host, settings.indexnowKey))) continue;
        const ping = await pingIndexNow({
          host,
          key: settings.indexnowKey,
          urls: [move.targetUrl],
        });
        if (ping.ok) pinged += 1;
      } catch (error) {
        failed += 1;
        const message = errorMessage(error);
        await MovesRepository.setVerification(move.id, {
          ok: false,
          details: { url, error: message },
        });
        log("verification failed", { move: move.title, error: message });
      }
    }

    return { checked: pending.length, verified, failed, pinged };
  },
};
