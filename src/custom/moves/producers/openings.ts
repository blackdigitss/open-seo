// Openings: queries where the site's best page already ranks 5-20. Upstream
// computes both the band (buildStrikingDistanceRows) and, when GA4 is
// connected, a percentile score per page (SearchOpportunityService) — we call
// them rather than re-deriving either.
import { buildStrikingDistanceRows } from "@/server/features/gsc/searchPerformanceReport";
import { GscService } from "@/server/features/gsc/services/GscService";
import { SearchOpportunityService } from "@/server/features/ga4/services/SearchOpportunityService";
import { draftTitleAndMeta } from "@/custom/moves/drafts";
import { upsideClicks } from "@/custom/moves/ctr";
import { scoreMove } from "@/custom/moves/score";
import type { MoveInput } from "@/custom/moves/types";
import { dayKey, shiftDays } from "@/custom/lib/time";
import {
  normalizeUrl,
  pathOf,
  percentile,
  type ProducerInput,
  type ProducerResult,
} from "./types";

// GSC finalizes data about three days back.
const GSC_LAG_DAYS = 3;
const MAX_MOVES = 12;

/** Page-level percentile scores from the GA4-joined opportunity service, keyed
 *  by normalized URL. Empty when GA4 isn't connected — the caller falls back to
 *  impressions rank. */
async function opportunityScores(
  projectId: string,
): Promise<{ scores: Map<string, number>; conversionRate: number | null }> {
  try {
    const result = await SearchOpportunityService.getOpportunities({
      projectId,
      limit: 50,
    });
    const scores = new Map<string, number>();
    let rateSum = 0;
    let rateCount = 0;
    for (const candidate of result.rows) {
      // Upstream scores 0-100; our ordinal is 0-1.
      if (typeof candidate.score === "number") {
        scores.set(normalizeUrl(candidate.page), candidate.score / 100);
      }
      const rate = candidate.ga4?.sessionKeyEventRate;
      if (typeof rate === "number" && rate > 0) {
        rateSum += rate;
        rateCount += 1;
      }
    }
    return {
      scores,
      conversionRate: rateCount > 0 ? rateSum / rateCount : null,
    };
  } catch {
    // No GA4, no GSC grant, or the service threw: openings still work from
    // impressions alone.
    return { scores: new Map(), conversionRate: null };
  }
}

export async function produceOpenings(
  input: ProducerInput,
): Promise<ProducerResult> {
  const endDate = shiftDays(dayKey(new Date()), -GSC_LAG_DAYS);
  const startDate = shiftDays(endDate, -27);

  const performance = await GscService.getPerformance({
    projectId: input.projectId,
    dimensions: ["query", "page"],
    startDate,
    endDate,
    rowLimit: 1000,
  });

  const rows = buildStrikingDistanceRows(performance.rows, MAX_MOVES);
  if (rows.length === 0) return { moves: [], liveKeys: [] };

  const { scores } = await opportunityScores(input.projectId);
  const businessName = input.domain ?? "the business";
  const moves: MoveInput[] = [];
  const liveKeys: string[] = [];

  for (const [index, row] of rows.entries()) {
    const dedupeKey = `sd:${row.query}`;
    liveKeys.push(dedupeKey);

    const normalized = normalizeUrl(row.page);
    const role = input.pageRoles.get(normalized) ?? null;
    // Upstream's percentile when GA4 joined this page; impressions rank
    // otherwise — both are 0..1 within this site.
    const ordinal = scores.get(normalized) ?? percentile(index, rows.length);
    const gain = upsideClicks(row.impressions, row.position);
    const scored = scoreMove({
      ordinal,
      upsideClicks: gain,
      economics: input.economics,
      pageRole: role,
    });

    const draft = await draftTitleAndMeta(input.env, {
      query: row.query,
      url: row.page,
      businessName,
      voice: input.voice,
    });

    // A title/meta rewrite is additive on an ordinary page; on a money page the
    // owner decides.
    const riskTier = role === "money" ? "risky" : "safe";

    moves.push({
      projectId: input.projectId,
      dedupeKey,
      type: "opening",
      source: "striking_distance",
      title: `Push "${row.query}" into the top 3`,
      hypothesis: `Retitling ${pathOf(row.page)} around "${row.query}" and answering it on the page moves it from position ${row.position.toFixed(1)} into the top 3.`,
      reason: `${row.impressions.toLocaleString()} impressions · position ${row.position.toFixed(1)} · ${pathOf(row.page)}`,
      evidence: {
        query: row.query,
        page: row.page,
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.position,
        window: { startDate, endDate },
        upsideClicks: gain,
        verify: { kind: "title", equals: draft.title },
      },
      targetUrl: row.page,
      targetQuery: row.query,
      after: draft.title,
      draft: draft.paragraph,
      snippet: [
        `<title>${draft.title}</title>`,
        `<meta name="description" content="${draft.metaDescription.replace(/"/g, "&quot;")}">`,
      ].join("\n"),
      whySafe:
        riskTier === "safe"
          ? "Changes the title and description only — nothing about how the page is indexed."
          : null,
      riskTier,
      score: scored.score,
      scoreInputs: scored.inputs,
      valueBucket: scored.valueBucket,
      verifyUrl: row.page,
    });
  }

  return { moves, liveKeys };
}
