import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { MOVE_STATUSES } from "@/db/custom/schema";
import { pageKey, sequencePage } from "@/custom/moves/pageGroup";
import { MovesRepository } from "@/custom/moves/repository";
import type { MoveStatus } from "@/custom/moves/types";

const listSchema = z.object({
  statuses: z.array(z.enum(MOVE_STATUSES)).optional(),
  projectId: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

const moveIdSchema = z.object({ moveId: z.string().min(1) });

export const listMoves = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(listSchema)
  .handler(async ({ data, context }) =>
    MovesRepository.listForOrganization(context.organizationId, {
      statuses: data.statuses as readonly MoveStatus[] | undefined,
      projectId: data.projectId,
      limit: data.limit,
    }),
  );

/** The Move, plus everything else still live on the same page. A page is what
 *  the owner actually opens and edits, so the detail view shows the whole
 *  session — including the Move that is holding this one back, when there is
 *  one. */
export const getMove = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(moveIdSchema)
  .handler(async ({ data, context }) => {
    const move = await MovesRepository.getForOrganization(
      context.organizationId,
      data.moveId,
    );
    if (!move) throw new AppError("NOT_FOUND", "Move not found");
    if (!move.targetUrl) return { ...move, siblings: [] };

    const key = pageKey(move.targetUrl);
    const siblings = sequencePage(
      (await MovesRepository.listReconcilable(move.projectId)).filter(
        (row) => row.id !== move.id && pageKey(row.targetUrl) === key,
      ),
    );
    return { ...move, siblings };
  });

/** Marks a Move done: stamps the time, sets the review date, and queues
 *  tomorrow morning's verification crawl. */
export const applyMove = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(moveIdSchema)
  .handler(async ({ data, context }) => {
    const move = await MovesRepository.getForOrganization(
      context.organizationId,
      data.moveId,
    );
    if (!move) throw new AppError("NOT_FOUND", "Move not found");
    return MovesRepository.markApplied(move.id);
  });

export const skipMove = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(moveIdSchema)
  .handler(async ({ data, context }) => {
    const move = await MovesRepository.getForOrganization(
      context.organizationId,
      data.moveId,
    );
    if (!move) throw new AppError("NOT_FOUND", "Move not found");
    return MovesRepository.setStatus(move.id, "skipped");
  });

export const reopenMove = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(moveIdSchema)
  .handler(async ({ data, context }) => {
    const move = await MovesRepository.getForOrganization(
      context.organizationId,
      data.moveId,
    );
    if (!move) throw new AppError("NOT_FOUND", "Move not found");
    return MovesRepository.setStatus(move.id, "open");
  });
