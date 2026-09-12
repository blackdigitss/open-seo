// Openings: pages whose best searches already rank 5-20. Upstream computes the
// band (buildStrikingDistanceRows) and, when GA4 is connected, a percentile per
// page (SearchOpportunityService) — we call them rather than re-deriving either.
//
// The unit here is the PAGE, not the query. GSC returns a row per search, so
// one page shows up as "mobile notary", "mobile notary near me", "mobile notary
// services" — and a Move per row means a dozen cards each proposing a different
// <title> for the same URL. Only one of those can ever be true. So each page's
// searches get clustered by intent, the heaviest cluster earns one Move, and
// everything else about the page rides along as evidence: the other searches
// the title has to serve, a second intent that wants its own page, and any
// other page of the site competing for the same search.
import { sort } from "remeda";
import { buildStrikingDistanceRows } from "@/server/features/gsc/searchPerformanceReport";
import { GscService } from "@/server/features/gsc/services/GscService";
import { SearchOpportunityService } from "@/server/features/ga4/services/SearchOpportunityService";
import { draftTitleAndMeta } from "@/custom/moves/drafts";
import { clusterQueries } from "@/custom/moves/cluster";
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
// Pages, now that a page is one Move however many searches it ranks for.
const MAX_MOVES = 8;
// Queries to collapse before picking the ones that matter.
const QUERY_POOL = 150;
// A second intent earns a mention only when it is worth a page of its own.
const SPLIT_SHARE = 0.3;
const SPLIT_MIN_CLICKS = 10;
// Another page counts as competing when it takes a real share of the same
// search, not when it shows up once on page three.
const CANNIBAL_SHARE = 0.2;
const CANNIBAL_MAX_POSITION = 20;

type Opening = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

/** Page-level percentile scores from the GA4-joined opportunity service, keyed
 *  by normalized URL. Empty when GA4 isn't connected — the caller falls back to
 *  impressions rank. */
async function opportunityScores(
  projectId: string,
): Promise<{ scores: Map<string, number> }> {
  try {
    const result = await SearchOpportunityService.getOpportunities({
      projectId,
      limit: 50,
    });
    const scores = new Map<string, number>();
    for (const candidate of result.rows) {
      // Upstream scores 0-100; our ordinal is 0-1.
      if (typeof candidate.score === "number") {
        scores.set(normalizeUrl(candidate.page), candidate.score / 100);
      }
    }
    return { scores };
  } catch {
    // No GA4, no GSC grant, or the service threw: openings still work from
    // impressions alone.
    return { scores: new Map() };
  }
}

/** Every page of the site that ranks for a query, so we can see when two of our
 *  own pages are competing for it. Keyed by query. */
function pagesByQuery(
  rows: Array<{ keys?: string[]; impressions: number; position: number }>,
) {
  const out = new Map<
    string,
    Array<{ page: string; impressions: number; position: number }>
  >();
  for (const row of rows) {
    const query = row.keys?.[0];
    const page = row.keys?.[1];
    if (!query || !page) continue;
    const bucket = out.get(query);
    const entry = {
      page,
      impressions: row.impressions,
      position: row.position,
    };
    if (bucket) bucket.push(entry);
    else out.set(query, [entry]);
  }
  return out;
}

/** Our own pages splitting one search between them. Left alone, the site's
 *  authority for that search is divided and neither page wins it. */
function competingPages(
  all: Map<
    string,
    Array<{ page: string; impressions: number; position: number }>
  >,
  query: string,
  winner: string,
) {
  const rows = all.get(query) ?? [];
  const winnerRow = rows.find(
    (row) => normalizeUrl(row.page) === normalizeUrl(winner),
  );
  const floor = (winnerRow?.impressions ?? 0) * CANNIBAL_SHARE;
  return rows
    .filter(
      (row) =>
        normalizeUrl(row.page) !== normalizeUrl(winner) &&
        row.position <= CANNIBAL_MAX_POSITION &&
        row.impressions >= floor &&
        row.impressions > 0,
    )
    .map((row) => ({
      page: row.page,
      impressions: row.impressions,
      position: Number(row.position.toFixed(1)),
    }));
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

  const openings: Opening[] = buildStrikingDistanceRows(
    performance.rows,
    QUERY_POOL,
  );
  if (openings.length === 0) return { moves: [], liveKeys: [] };

  // One bucket per page, in the impressions order upstream sorted them into.
  const byPage = new Map<string, { url: string; rows: Opening[] }>();
  for (const row of openings) {
    const key = normalizeUrl(row.page);
    const bucket = byPage.get(key);
    if (bucket) bucket.rows.push(row);
    else byPage.set(key, { url: row.page, rows: [row] });
  }

  const gainOf = (row: Opening) => upsideClicks(row.impressions, row.position);

  // A page is worth as much as the single intent its title can actually serve,
  // so rank pages by their best cluster rather than by everything they rank for.
  const pages = sort(
    [...byPage.values()].map((bucket) => {
      const clusters = clusterQueries(
        bucket.rows,
        (row) => row.query,
        (row) => gainOf(row),
      );
      return { ...bucket, primary: clusters[0], others: clusters.slice(1) };
    }),
    (a, b) => b.primary.weight - a.primary.weight,
  ).slice(0, MAX_MOVES);

  const { scores } = await opportunityScores(input.projectId);
  const allPagesByQuery = pagesByQuery(performance.rows);
  const businessName = input.domain ?? "the business";
  const moves: MoveInput[] = [];
  const liveKeys: string[] = [];

  for (const [index, page] of pages.entries()) {
    const normalized = normalizeUrl(page.url);
    // Keyed by page, so however the searches shuffle night to night the owner
    // keeps looking at one card for one page.
    const dedupeKey = `sd:page:${normalized}`;
    liveKeys.push(dedupeKey);

    const cluster = page.primary;
    const lead = cluster.primary;
    const clusterQueryList = cluster.members.map((row) => row.query);
    const role = input.pageRoles.get(normalized) ?? null;
    // Upstream's percentile when GA4 joined this page; rank among the pages we
    // shortlisted otherwise — both are 0..1 within this site.
    const ordinal = scores.get(normalized) ?? percentile(index, pages.length);

    // Every search in the cluster wants the same page saying the same thing, so
    // the whole cluster moves together. Other clusters on the page do not — one
    // title cannot serve two intents, and pretending otherwise is the clash
    // this producer exists to avoid.
    const gain = cluster.weight;
    const clusterImpressions = cluster.members.reduce(
      (total, row) => total + row.impressions,
      0,
    );

    const splits = page.others.filter(
      (other) =>
        other.weight >= cluster.weight * SPLIT_SHARE &&
        other.weight >= SPLIT_MIN_CLICKS,
    );
    const competitors = competingPages(allPagesByQuery, lead.query, page.url);

    const scored = scoreMove({
      ordinal,
      upsideClicks: gain,
      economics: input.economics,
      pageRole: role,
    });

    const draft = await draftTitleAndMeta(input.env, {
      queries: clusterQueryList,
      url: page.url,
      businessName,
      voice: input.voice,
    });

    // A title/meta rewrite is additive on an ordinary page; on a money page the
    // owner decides.
    const riskTier = role === "money" ? "risky" : "safe";

    const hypothesis = [
      `Retitling ${pathOf(page.url)} around "${lead.query}" and answering it on the page moves it from position ${lead.position.toFixed(1)} into the top 3.`,
      clusterQueryList.length > 1
        ? `The same copy serves ${clusterQueryList.length} near-identical searches, so this is one edit, not ${clusterQueryList.length}.`
        : "",
      splits.length > 0
        ? `Separately, ${pathOf(page.url)} also ranks for "${splits[0].primary.query}" — a different question this title can't answer too. That one wants its own page.`
        : "",
      competitors.length > 0
        ? `${competitors.map((row) => pathOf(row.page)).join(" and ")} also rank${competitors.length === 1 ? "s" : ""} for "${lead.query}"; pick one page to win it rather than splitting the site's authority.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    moves.push({
      projectId: input.projectId,
      dedupeKey,
      type: "opening",
      source: "striking_distance",
      title:
        clusterQueryList.length > 1
          ? `Push "${lead.query}" (+${clusterQueryList.length - 1} like it) into the top 3`
          : `Push "${lead.query}" into the top 3`,
      hypothesis,
      reason: `${clusterImpressions.toLocaleString()} impressions · position ${lead.position.toFixed(1)} · ${clusterQueryList.length} search${clusterQueryList.length === 1 ? "" : "es"} · ${pathOf(page.url)}`,
      evidence: {
        query: lead.query,
        page: page.url,
        impressions: clusterImpressions,
        clicks: cluster.members.reduce((total, row) => total + row.clicks, 0),
        position: lead.position,
        window: { startDate, endDate },
        upsideClicks: gain,
        queries: cluster.members.map((row) => ({
          query: row.query,
          impressions: row.impressions,
          position: Number(row.position.toFixed(1)),
        })),
        otherIntents: splits.map((other) => ({
          query: other.primary.query,
          impressions: other.members.reduce(
            (total, row) => total + row.impressions,
            0,
          ),
          upsideClicks: other.weight,
        })),
        competingPages: competitors,
        verify: { kind: "title", equals: draft.title },
      },
      targetUrl: page.url,
      targetQuery: lead.query,
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
      verifyUrl: page.url,
    });
  }

  return { moves, liveKeys };
}
