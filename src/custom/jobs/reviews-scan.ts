// Weekly Google Business review pull for projects that named their listing in
// Settings → Moves. New reviews land as one summary per project; a bad one
// interrupts immediately with a reply drafted in the business's voice —
// response time is what limits the damage.
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { customReviews } from "@/db/custom/schema";
import { createDataforseoClient } from "@/server/lib/dataforseo/client";
import { fetchBusinessDataTaskResult } from "@/server/lib/dataforseo/business";
import { canSpend, dataforseoConfigured } from "@/custom/budget";
import { generateText } from "@/custom/llm";
import { errorMessage } from "@/custom/lib/log";
import { isoNow } from "@/custom/lib/time";
import { billingContextFor, listIntelProjects } from "@/custom/intel/context";
import {
  parseReviewItem,
  reviewStats,
  type ParsedReview,
} from "@/custom/intel/reviews";
import { SnapshotsRepository } from "@/custom/intel/snapshots";
import { notify } from "@/custom/notify";
import { SettingsRepository } from "@/custom/settings/repository";
import type { JobDefinition } from "./runner";
import { weeklyOn } from "./schedule";

const DEPTH = 40;
const ESTIMATE_USD = 0.05;
// Reviews collect asynchronously; a Worker invocation can afford a few short
// polls before handing the rest to next week's run.
const POLLS = 4;
const POLL_WAIT_MS = 8000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function collectReviews(taskId: string): Promise<ParsedReview[] | null> {
  for (let attempt = 0; attempt < POLLS; attempt++) {
    await wait(POLL_WAIT_MS);
    const outcome = await fetchBusinessDataTaskResult({
      endpoint: "reviews",
      taskId,
    });
    if (outcome.status === "completed") {
      const items = outcome.result?.items;
      if (!Array.isArray(items)) return [];
      return items
        .filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object",
        )
        .map(parseReviewItem)
        .filter((review): review is ParsedReview => review !== null);
    }
  }
  return null;
}

async function replyDraft(
  env: Cloudflare.Env,
  businessName: string,
  review: ParsedReview,
): Promise<string> {
  const fallback = `Thank you for taking the time to share this — I'm sorry the experience fell short. I'd like to make it right; please reach out directly so we can sort it out.`;
  const generated = await generateText(env, {
    system:
      "You write short, courteous owner replies to Google reviews for a small local business. Two sentences: acknowledge specifically, invite direct contact. Never argue, never make excuses, never offer discounts.",
    prompt: `Business: ${businessName}\nRating: ${review.rating ?? "?"}/5\nReview: ${review.text ?? "(no text)"}\n\nWrite the owner's reply.`,
    maxTokens: 150,
  });
  return generated?.trim() || fallback;
}

export const reviewsScanJob: JobDefinition = {
  name: "reviews_scan",
  due: weeklyOn(2, 8),
  run: async ({ env, now, log }) => {
    if (!dataforseoConfigured(env)) return { skipped: "no DataForSEO key" };

    const projects = await listIntelProjects();
    let scanned = 0;
    let newReviews = 0;

    for (const project of projects) {
      const settings = await SettingsRepository.getProject(project.id);
      if (!settings.reviewsBusinessName) continue;
      const spend = await canSpend(project.organizationId, ESTIMATE_USD, now);
      if (!spend.allowed) continue;

      try {
        const client = createDataforseoClient(billingContextFor(project));
        const taskId = await client.business.reviewsTaskPost({
          keyword: settings.reviewsBusinessName,
          locationCode: project.locationCode,
          languageCode: project.languageCode,
          depth: DEPTH,
          sortBy: "newest",
          includeOtherSources: false,
        });
        const reviews = await collectReviews(taskId);
        if (reviews === null) {
          log("still collecting; next week's run picks it up", {
            project: project.name,
          });
          continue;
        }
        scanned += 1;

        // New = not already stored for this project.
        const existing =
          reviews.length > 0
            ? await db
                .select({ externalId: customReviews.externalId })
                .from(customReviews)
                .where(
                  inArray(
                    customReviews.externalId,
                    reviews.map((review) => review.externalId),
                  ),
                )
            : [];
        const known = new Set(existing.map((row) => row.externalId));
        const fresh = reviews.filter((review) => !known.has(review.externalId));

        for (const review of fresh) {
          await db
            .insert(customReviews)
            .values({
              id: crypto.randomUUID(),
              projectId: project.id,
              externalId: review.externalId,
              author: review.author,
              rating: review.rating,
              text: review.text,
              publishedAt: review.publishedAt,
              ownerReplied: review.ownerReplied,
              seenAt: isoNow(),
            })
            .onConflictDoNothing();
        }
        newReviews += fresh.length;

        const stats = reviewStats(reviews);
        await SnapshotsRepository.insert({
          projectId: project.id,
          kind: "reviews_summary",
          summary: {
            count: stats.count,
            averageRating: stats.averageRating,
            unanswered: stats.unanswered,
            newThisScan: fresh.length,
          },
          payload: {},
        });

        // The first scan is a backfill, not news.
        const isFirstScan = known.size === 0 && fresh.length === reviews.length;
        if (!isFirstScan && fresh.length > 0) {
          const freshStats = reviewStats(fresh);
          await notify(env, {
            organizationId: project.organizationId,
            projectId: project.id,
            kind: "event",
            title: `${fresh.length} new review${fresh.length === 1 ? "" : "s"} — ${settings.reviewsBusinessName}`,
            body: `Average ${freshStats.averageRating?.toFixed(1) ?? "?"}★ · ${freshStats.unanswered} awaiting a reply.`,
          });
          for (const bad of freshStats.bad) {
            const draft = await replyDraft(
              env,
              settings.reviewsBusinessName,
              bad,
            );
            await notify(env, {
              organizationId: project.organizationId,
              projectId: project.id,
              kind: "event",
              title: `${bad.rating}★ review from ${bad.author ?? "a customer"} — reply soon`,
              body: `"${(bad.text ?? "(no text)").slice(0, 300)}"\n\n**Suggested reply:**\n${draft}`,
            });
          }
        }
      } catch (error) {
        log("reviews scan failed", {
          project: project.name,
          error: errorMessage(error),
        });
      }
    }

    return { projects: projects.length, scanned, newReviews };
  },
};
