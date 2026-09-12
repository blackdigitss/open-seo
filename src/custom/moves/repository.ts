import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { customMoves } from "@/db/custom/schema";
import { isoNow, shiftDays } from "@/custom/lib/time";
import type { MoveInput, MoveRow, MoveStatus, Verdict } from "./types";

// A superseded Move is still a live finding — it just isn't the one to do
// first — so producers refresh it and resolve it like an open one.
const OPEN_STATUSES = ["open", "superseded"] as const;
const ACTIVE_STATUSES = [
  "open",
  "applied",
  "verified",
  "verify_failed",
] as const;

function rowFromInput(input: MoveInput, now: string) {
  return {
    projectId: input.projectId,
    dedupeKey: input.dedupeKey,
    type: input.type,
    source: input.source,
    title: input.title,
    hypothesis: input.hypothesis,
    reason: input.reason,
    evidenceJson: JSON.stringify(input.evidence ?? {}),
    targetUrl: input.targetUrl ?? null,
    targetQuery: input.targetQuery ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    draft: input.draft ?? null,
    snippet: input.snippet ?? null,
    whySafe: input.whySafe ?? null,
    riskTier: input.riskTier,
    score: input.score,
    scoreInputsJson: JSON.stringify(input.scoreInputs ?? {}),
    valueBucket: input.valueBucket ?? null,
    verifyUrl: input.verifyUrl ?? input.targetUrl ?? null,
    updatedAt: now,
  };
}

/** Insert a move, or refresh an existing one with the same dedupe key. An
 *  applied/verified/skipped move is left alone — the owner's decision wins over
 *  a producer re-observing the same signal. Returns the row and whether it is
 *  new. */
async function upsert(
  input: MoveInput,
): Promise<{ row: MoveRow; created: boolean }> {
  const now = isoNow();
  const [existing] = await db
    .select()
    .from(customMoves)
    .where(
      and(
        eq(customMoves.projectId, input.projectId),
        eq(customMoves.dedupeKey, input.dedupeKey),
      ),
    )
    .limit(1);

  if (existing) {
    const refreshable =
      existing.status === "open" ||
      existing.status === "resolved" ||
      existing.status === "superseded";
    if (!refreshable) return { row: existing, created: false };
    const values = rowFromInput(input, now);
    // A resolved signal that came back reopens. A superseded one keeps its
    // status and winner; tonight's reconcile pass re-decides that.
    const [row] = await db
      .update(customMoves)
      .set({
        ...values,
        // Keep an LLM draft the first run produced if the producer has none now.
        draft: values.draft ?? existing.draft,
        snippet: values.snippet ?? existing.snippet,
        status: existing.status === "superseded" ? "superseded" : "open",
      })
      .where(eq(customMoves.id, existing.id))
      .returning();
    return { row: row ?? existing, created: false };
  }

  const [row] = await db
    .insert(customMoves)
    .values({
      id: crypto.randomUUID(),
      ...rowFromInput(input, now),
      status: "open",
      createdAt: now,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return { row, created: true };
}

/** Mark open moves from `source` whose dedupe keys are NOT in `liveKeys` as
 *  resolved — the signal disappeared on its own (the owner fixed it outside
 *  the app, the query moved). Returns how many were resolved. */
async function resolveMissing(
  projectId: string,
  source: MoveRow["source"],
  liveKeys: string[],
): Promise<number> {
  const open = await db
    .select({ id: customMoves.id, dedupeKey: customMoves.dedupeKey })
    .from(customMoves)
    .where(
      and(
        eq(customMoves.projectId, projectId),
        eq(customMoves.source, source),
        inArray(customMoves.status, [...OPEN_STATUSES]),
      ),
    );
  const live = new Set(liveKeys);
  const stale = open.filter((row) => !live.has(row.dedupeKey));
  if (stale.length === 0) return 0;
  await db
    .update(customMoves)
    .set({ status: "resolved", updatedAt: isoNow() })
    .where(
      inArray(
        customMoves.id,
        stale.map((row) => row.id),
      ),
    );
  return stale.length;
}

async function getForOrganization(
  organizationId: string,
  moveId: string,
): Promise<
  (MoveRow & { projectName: string; projectDomain: string | null }) | null
> {
  const [row] = await db
    .select({
      move: customMoves,
      projectName: projects.name,
      projectDomain: projects.domain,
    })
    .from(customMoves)
    .innerJoin(projects, eq(projects.id, customMoves.projectId))
    .where(
      and(
        eq(customMoves.id, moveId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    ...row.move,
    projectName: row.projectName,
    projectDomain: row.projectDomain,
  };
}

async function listForOrganization(
  organizationId: string,
  options: {
    statuses?: readonly MoveStatus[];
    projectId?: string;
    limit?: number;
  } = {},
) {
  const statuses = options.statuses ?? ACTIVE_STATUSES;
  const conditions = [
    eq(projects.organizationId, organizationId),
    inArray(customMoves.status, [...statuses]),
  ];
  if (options.projectId)
    conditions.push(eq(customMoves.projectId, options.projectId));
  const rows = await db
    .select({
      move: customMoves,
      projectName: projects.name,
      projectDomain: projects.domain,
    })
    .from(customMoves)
    .innerJoin(projects, eq(projects.id, customMoves.projectId))
    .where(and(...conditions))
    .orderBy(desc(customMoves.score), desc(customMoves.createdAt))
    .limit(options.limit ?? 200);
  return rows.map((row) => ({
    ...row.move,
    projectName: row.projectName,
    projectDomain: row.projectDomain,
  }));
}

async function listOpenForProject(projectId: string, limit = 50) {
  return db
    .select()
    .from(customMoves)
    .where(
      and(eq(customMoves.projectId, projectId), eq(customMoves.status, "open")),
    )
    .orderBy(desc(customMoves.score))
    .limit(limit);
}

/** Everything the nightly reconcile pass arbitrates over: what is open now plus
 *  what stepped aside earlier, so a Move can come back when its winner is done. */
async function listReconcilable(projectId: string) {
  return db
    .select()
    .from(customMoves)
    .where(
      and(
        eq(customMoves.projectId, projectId),
        inArray(customMoves.status, [...OPEN_STATUSES]),
      ),
    );
}

/** Hold a Move back behind the Move that already rewrites its surface. */
async function supersede(moveId: string, supersededBy: string) {
  await db
    .update(customMoves)
    .set({ status: "superseded", supersededBy, updatedAt: isoNow() })
    .where(eq(customMoves.id, moveId));
}

async function reopenSuperseded(moveIds: string[]) {
  if (moveIds.length === 0) return;
  await db
    .update(customMoves)
    .set({ status: "open", supersededBy: null, updatedAt: isoNow() })
    .where(inArray(customMoves.id, moveIds));
}

async function countByStatusForProjects(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      projectId: customMoves.projectId,
      status: customMoves.status,
      count: sql<number>`count(*)`,
      topScore: sql<number>`max(${customMoves.score})`,
    })
    .from(customMoves)
    .where(inArray(customMoves.projectId, projectIds))
    .groupBy(customMoves.projectId, customMoves.status);
}

async function markApplied(moveId: string, reviewAfterDays = 28) {
  const now = new Date();
  const [row] = await db
    .update(customMoves)
    .set({
      status: "applied",
      supersededBy: null,
      appliedAt: now.toISOString(),
      reviewAt: shiftDays(now.toISOString().slice(0, 10), reviewAfterDays),
      updatedAt: now.toISOString(),
    })
    .where(eq(customMoves.id, moveId))
    .returning();
  return row ?? null;
}

async function setStatus(moveId: string, status: MoveStatus) {
  const [row] = await db
    .update(customMoves)
    .set({ status, supersededBy: null, updatedAt: isoNow() })
    .where(eq(customMoves.id, moveId))
    .returning();
  return row ?? null;
}

async function setVerification(
  moveId: string,
  result: { ok: boolean; details: Record<string, unknown> },
) {
  const now = isoNow();
  const [row] = await db
    .update(customMoves)
    .set({
      status: result.ok ? "verified" : "verify_failed",
      verifiedAt: now,
      verifyResultJson: JSON.stringify(result.details),
      updatedAt: now,
    })
    .where(eq(customMoves.id, moveId))
    .returning();
  return row ?? null;
}

async function setDraft(
  moveId: string,
  draft: string | null,
  snippet: string | null,
) {
  await db
    .update(customMoves)
    .set({ draft, snippet, updatedAt: isoNow() })
    .where(eq(customMoves.id, moveId));
}

/** Applied/verified moves whose review date has arrived. */
async function listDueForVerdict(today: string) {
  return db
    .select({
      move: customMoves,
      projectName: projects.name,
      organizationId: projects.organizationId,
    })
    .from(customMoves)
    .innerJoin(projects, eq(projects.id, customMoves.projectId))
    .where(
      and(
        inArray(customMoves.status, ["applied", "verified", "verify_failed"]),
        lte(customMoves.reviewAt, today),
      ),
    );
}

async function conclude(moveId: string, verdict: Verdict) {
  const now = isoNow();
  await db
    .update(customMoves)
    .set({
      status: "concluded",
      verdictJson: JSON.stringify(verdict),
      updatedAt: now,
    })
    .where(eq(customMoves.id, moveId));
}

/** Applied yesterday or earlier and never verified. */
async function listAwaitingVerification() {
  return db
    .select({ move: customMoves, organizationId: projects.organizationId })
    .from(customMoves)
    .innerJoin(projects, eq(projects.id, customMoves.projectId))
    .where(eq(customMoves.status, "applied"));
}

export const MovesRepository = {
  upsert,
  resolveMissing,
  getForOrganization,
  listForOrganization,
  listOpenForProject,
  listReconcilable,
  supersede,
  reopenSuperseded,
  countByStatusForProjects,
  markApplied,
  setStatus,
  setVerification,
  setDraft,
  listDueForVerdict,
  listAwaitingVerification,
  conclude,
};
