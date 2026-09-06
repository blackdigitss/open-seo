// Decay: pages losing search clicks. Two guards keep this honest at small-site
// scale (DECISIONS.md D4) — a 30-click floor on both windows, and a
// year-over-year check so a seasonal business doesn't get told every September
// that its summer pages are dying.
import { sort } from "remeda";
import { GscService } from "@/server/features/gsc/services/GscService";
import { draftRefreshNotes } from "@/custom/moves/drafts";
import { scoreMove } from "@/custom/moves/score";
import type { MoveInput } from "@/custom/moves/types";
import {
  dayKey,
  lastYearWindow,
  previousWindow,
  shiftDays,
} from "@/custom/lib/time";
import { assessDecay, type DecayAssessment } from "./rules";
import {
  normalizeUrl,
  pathOf,
  type ProducerInput,
  type ProducerResult,
} from "./types";

const GSC_LAG_DAYS = 3;
const MAX_MOVES = 6;

async function clicksByPage(
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, number>> {
  const performance = await GscService.getPerformance({
    projectId,
    dimensions: ["page"],
    startDate,
    endDate,
    rowLimit: 1000,
  });
  const out = new Map<string, number>();
  for (const row of performance.rows) {
    const page = row.keys?.[0];
    if (page) out.set(normalizeUrl(page), row.clicks);
  }
  return out;
}

export async function produceDecay(
  input: ProducerInput,
): Promise<ProducerResult> {
  const endDate = shiftDays(dayKey(new Date()), -GSC_LAG_DAYS);
  const startDate = shiftDays(endDate, -27);
  const prior = previousWindow(startDate, endDate);
  const lastYear = lastYearWindow(startDate, endDate);
  const lastYearPrior = lastYearWindow(prior.start, prior.end);

  const [current, priorClicks, lastYearCurrent, lastYearPriorClicks] =
    await Promise.all([
      clicksByPage(input.projectId, startDate, endDate),
      clicksByPage(input.projectId, prior.start, prior.end),
      clicksByPage(input.projectId, lastYear.start, lastYear.end).catch(
        () => new Map<string, number>(),
      ),
      clicksByPage(
        input.projectId,
        lastYearPrior.start,
        lastYearPrior.end,
      ).catch(() => new Map<string, number>()),
    ]);

  const candidates: Array<{
    page: string;
    assessment: DecayAssessment;
    lost: number;
  }> = [];

  for (const [page, priorValue] of priorClicks) {
    const assessment = assessDecay({
      current: current.get(page) ?? 0,
      prior: priorValue,
      lastYearCurrent: lastYearCurrent.get(page) ?? null,
      lastYearPrior: lastYearPriorClicks.get(page) ?? null,
    });
    if (!assessment.flagged) continue;
    candidates.push({
      page,
      assessment,
      lost: priorValue - (current.get(page) ?? 0),
    });
  }

  const top = sort(candidates, (a, b) => b.lost - a.lost).slice(0, MAX_MOVES);
  const businessName = input.domain ?? "the business";
  const moves: MoveInput[] = [];
  const liveKeys: string[] = [];

  for (const candidate of top) {
    const dedupeKey = `decay:${candidate.page}`;
    liveKeys.push(dedupeKey);
    const role = input.pageRoles.get(candidate.page) ?? null;
    const scored = scoreMove({
      ordinal: Math.min(1, candidate.assessment.dropShare),
      upsideClicks: candidate.lost,
      economics: input.economics,
      pageRole: role,
    });
    const notes = await draftRefreshNotes(input.env, {
      url: candidate.page,
      businessName,
      voice: input.voice,
      queries: [],
    });

    moves.push({
      projectId: input.projectId,
      dedupeKey,
      type: "fix",
      source: "decay",
      title: `${pathOf(candidate.page)} is losing search clicks`,
      hypothesis: `Refreshing ${pathOf(candidate.page)} — dates, prices, and the questions it answers — recovers the clicks it has been shedding.`,
      reason: candidate.assessment.reason,
      evidence: {
        page: candidate.page,
        current: current.get(candidate.page) ?? 0,
        prior: priorClicks.get(candidate.page) ?? 0,
        lastYearCurrent: lastYearCurrent.get(candidate.page) ?? null,
        lastYearPrior: lastYearPriorClicks.get(candidate.page) ?? null,
        windows: { current: { startDate, endDate }, prior },
        verify: { kind: "none" },
      },
      targetUrl: candidate.page,
      draft: notes,
      // Body copy is never auto-safe.
      riskTier: "risky",
      score: scored.score,
      scoreInputs: scored.inputs,
      valueBucket: scored.valueBucket,
      verifyUrl: candidate.page,
    });
  }

  return { moves, liveKeys };
}
