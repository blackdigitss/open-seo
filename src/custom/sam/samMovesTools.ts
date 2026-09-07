// The fork's data, handed to SAM. Without these the in-app agent can research
// anything but can't see the one queue the owner actually works from.
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { MOVE_STATUSES } from "@/db/custom/schema";
import { parseJson } from "@/custom/lib/json";
import { MovesRepository } from "@/custom/moves/repository";
import { SnapshotsRepository } from "@/custom/intel/snapshots";
import type { MoveStatus } from "@/custom/moves/types";

function compactMove(move: {
  id: string;
  title: string;
  reason: string;
  type: string;
  source: string;
  status: string;
  riskTier: string;
  valueBucket: string | null;
  targetUrl: string | null;
  targetQuery: string | null;
  hypothesis: string;
  draft: string | null;
  snippet: string | null;
  verdictJson: string | null;
}) {
  return {
    id: move.id,
    title: move.title,
    reason: move.reason,
    type: move.type,
    source: move.source,
    status: move.status,
    risk: move.riskTier,
    valueBucket: move.valueBucket,
    targetUrl: move.targetUrl,
    targetQuery: move.targetQuery,
    hypothesis: move.hypothesis,
    draft: move.draft,
    snippet: move.snippet,
    verdict: move.verdictJson
      ? parseJson<Record<string, unknown> | null>(move.verdictJson, null)
      : null,
  };
}

/** Moves + history tools for SAM, scoped to the chat's project the same way
 *  the upstream tools are. */
export function buildSamMovesTools(
  organizationId: string,
  projectId: string,
): ToolSet {
  return {
    list_moves: tool({
      description:
        "The project's Moves queue — the ranked fixes and openings the app maintains nightly (from Search Console, site audits, and competitor gaps), each with an evidence-backed reason, a risk tier, and usually a paste-ready snippet or draft. This is what the owner acts on; check it before proposing work of your own, and reference moves by title. Uses no credits.",
      inputSchema: z.object({
        status: z
          .enum(MOVE_STATUSES)
          .optional()
          .describe("Filter by status; omit for open + in-flight moves."),
      }),
      execute: async ({ status }) => {
        const moves = await MovesRepository.listForOrganization(
          organizationId,
          {
            projectId,
            statuses: status ? ([status] as readonly MoveStatus[]) : undefined,
            limit: 50,
          },
        );
        return { count: moves.length, moves: moves.map(compactMove) };
      },
    }),

    complete_move: tool({
      description:
        "Mark a Move done (the owner applied the change) or skipped (the owner decided against it). Only act on the owner's explicit say-so in this conversation — never mark moves on your own initiative. Done schedules an automatic verification crawl of the page the next morning. Uses no credits.",
      inputSchema: z.object({
        moveId: z.string().min(1),
        outcome: z.enum(["done", "skip"]),
      }),
      execute: async ({ moveId, outcome }) => {
        const move = await MovesRepository.getForOrganization(
          organizationId,
          moveId,
        );
        if (!move || move.projectId !== projectId) {
          return { error: "No such move in this project." };
        }
        if (outcome === "done") {
          await MovesRepository.markApplied(move.id);
          return {
            ok: true,
            note: "Marked done. The page gets a verification crawl tomorrow morning, and a before/after verdict in 28 days.",
          };
        }
        await MovesRepository.setStatus(move.id, "skipped");
        return { ok: true, note: "Skipped." };
      },
    }),

    get_analysis_history: tool({
      description:
        "The project's dated analysis history: every paid snapshot the app has kept (AI share of voice, brand search volume, competitor keyword gaps, review stats) with when it was taken. Use it to answer trend questions without spending credits — only re-running an analysis costs money.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await SnapshotsRepository.listForProject(projectId, 40);
        return { count: rows.length, snapshots: rows };
      },
    }),
  };
}
