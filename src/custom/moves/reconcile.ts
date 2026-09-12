// The nightly arbitration pass. Producers are deliberately blind to each other
// — openings looks at queries, decay at clicks, audit at crawl issues — so the
// same page can end the night with three Moves, two of which rewrite its
// <title> with different text. Applying both is impossible; auto-apply would
// push both to the edge, the second would win, and the first would fail its own
// verification and poison the verdict for that page.
//
// So after every producer has had its say, one pass looks at each URL as a
// whole: a surface the page can only answer once keeps its best Move, and a
// Move whose whole job is already covered by a better one steps aside instead
// of competing. It is idempotent and self-healing — when the winner is applied,
// skipped or resolved, whoever stepped aside comes back open on the next run.
import { isExclusive, pageKey, sequencePage, surfacesOf } from "./pageGroup";
import type { MoveRow } from "./types";

type Supersession = { moveId: string; supersededBy: string };

type ReconcilePlan = {
  /** Open Moves fully covered by a better Move on the same page. */
  supersede: Supersession[];
  /** Superseded Moves whose winner is no longer holding the surface. */
  reopen: string[];
};

/** Decide, from every open and superseded Move of one project, who holds each
 *  page surface. `moves` must carry both statuses for the reopen half to work. */
export function planReconcile(moves: readonly MoveRow[]): ReconcilePlan {
  const supersede: Supersession[] = [];
  const reopen: string[] = [];

  const byPage = new Map<string, MoveRow[]>();
  for (const move of moves) {
    if (move.status !== "open" && move.status !== "superseded") continue;
    // No URL, no page to clash over.
    if (!move.targetUrl) continue;
    const key = pageKey(move.targetUrl);
    const bucket = byPage.get(key);
    if (bucket) bucket.push(move);
    else byPage.set(key, [move]);
  }

  for (const page of byPage.values()) {
    // Everything competes on equal footing each run, so yesterday's loser can
    // win today once the page's better Move is done with.
    const claimed = new Map<string, string>();
    for (const move of sequencePage(page)) {
      const exclusive = surfacesOf(move).filter(isExclusive);
      const contested = exclusive.filter((surface) => claimed.has(surface));

      // Covered only when every surface it writes is already spoken for. A Move
      // that still owns one surface outright is complementary work, not a
      // duplicate — it stays open and the page plan sequences it.
      const covered =
        exclusive.length > 0 && contested.length === exclusive.length;
      // `contested` only holds surfaces already in `claimed`, so a covered Move
      // always has a winner to step aside for.
      const winner = covered ? claimed.get(contested[0]) : undefined;
      if (winner) {
        if (move.status !== "superseded" || move.supersededBy !== winner) {
          supersede.push({ moveId: move.id, supersededBy: winner });
        }
        continue;
      }

      for (const surface of exclusive) {
        if (!claimed.has(surface)) claimed.set(surface, move.id);
      }
      if (move.status === "superseded") reopen.push(move.id);
    }
  }

  return { supersede, reopen };
}
