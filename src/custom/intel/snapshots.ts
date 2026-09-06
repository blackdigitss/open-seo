// Dated snapshots of paid analyses. Upstream's R2 cache makes a repeat of the
// same lookup free for a day, but it overwrites per key and expires — history
// never accumulates (their own #266). Rows here are permanent: every analysis
// keeps its taken-at date, so "how has this moved since spring" is a free
// query instead of a re-purchase.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customSnapshots, type SNAPSHOT_KINDS } from "@/db/custom/schema";
import { isoNow } from "@/custom/lib/time";
import { parseJson } from "@/custom/lib/json";

type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];
type SnapshotRow = typeof customSnapshots.$inferSelect;

async function insert(input: {
  projectId: string;
  kind: SnapshotKind;
  summary: Record<string, unknown>;
  payload: Record<string, unknown>;
}): Promise<SnapshotRow> {
  const [row] = await db
    .insert(customSnapshots)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      kind: input.kind,
      takenAt: isoNow(),
      summaryJson: JSON.stringify(input.summary),
      payloadJson: JSON.stringify(input.payload),
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

async function latest(
  projectId: string,
  kind: SnapshotKind,
): Promise<SnapshotRow | null> {
  const [row] = await db
    .select()
    .from(customSnapshots)
    .where(
      and(
        eq(customSnapshots.projectId, projectId),
        eq(customSnapshots.kind, kind),
      ),
    )
    .orderBy(desc(customSnapshots.takenAt))
    .limit(1);
  return row ?? null;
}

/** Newest first; summaries only — payloads are fetched per snapshot. */
async function listForProject(projectId: string, limit = 60) {
  const rows = await db
    .select({
      id: customSnapshots.id,
      kind: customSnapshots.kind,
      takenAt: customSnapshots.takenAt,
      summaryJson: customSnapshots.summaryJson,
    })
    .from(customSnapshots)
    .where(eq(customSnapshots.projectId, projectId))
    .orderBy(desc(customSnapshots.takenAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    takenAt: row.takenAt,
    summary: parseJson<Record<string, unknown>>(row.summaryJson, {}),
  }));
}

function summaryOf(row: SnapshotRow): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(row.summaryJson, {});
}

export const SnapshotsRepository = { insert, latest, listForProject };

/** A numeric field out of a summary, or null — summaries are loose JSON. */
export function summaryNumber(
  row: SnapshotRow | null,
  field: string,
): number | null {
  if (!row) return null;
  const value = summaryOf(row)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Percentage-point change between two share values, null-safe. */
export function pointsMoved(
  previous: number | null | undefined,
  current: number | null | undefined,
): number | null {
  if (typeof previous !== "number" || typeof current !== "number") return null;
  return Math.abs(current - previous);
}

/** Relative change (0.25 = 25%), null when the base can't support one. */
export function relativeChange(
  previous: number | null | undefined,
  current: number | null | undefined,
): number | null {
  if (typeof previous !== "number" || typeof current !== "number") return null;
  if (previous <= 0) return null;
  return (current - previous) / previous;
}
