import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Inbox } from "lucide-react";
import { listMoves } from "@/custom/serverFunctions/moves";
import type { MoveStatus } from "@/custom/moves/types";
import { BucketBadge, RiskBadge, ScoreBar, StatusBadge } from "./MoveBadges";
import { pathOf } from "./format";

const FILTERS: Array<{ label: string; statuses: MoveStatus[] }> = [
  { label: "To do", statuses: ["open"] },
  { label: "In flight", statuses: ["applied", "verified", "verify_failed"] },
  { label: "Done", statuses: ["concluded", "skipped", "resolved"] },
];

export function MovesList({ projectId }: { projectId?: string }) {
  const [filter, setFilter] = React.useState(0);
  const statuses = FILTERS[filter].statuses;

  const movesQuery = useQuery({
    queryKey: ["custom", "moves", projectId ?? "all", statuses.join(",")],
    queryFn: () => listMoves({ data: { statuses, projectId } }),
  });

  const moves = movesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div role="tablist" className="tabs tabs-border">
        {FILTERS.map((entry, index) => (
          <button
            key={entry.label}
            type="button"
            role="tab"
            className={`tab ${index === filter ? "tab-active" : ""}`}
            aria-selected={index === filter}
            onClick={() => setFilter(index)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {movesQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((n) => (
            <div key={n} className="skeleton h-20 w-full" />
          ))}
        </div>
      ) : moves.length === 0 ? (
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body items-center text-center">
            <Inbox className="size-8 text-base-content/30" />
            <p className="text-sm text-base-content/60">
              {filter === 0
                ? "Nothing to do right now. New moves arrive overnight."
                : "Nothing here yet."}
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {moves.map((move) => (
            <li key={move.id}>
              <Link
                to="/moves/$moveId"
                params={{ moveId: move.id }}
                className="flex min-h-[44px] items-start gap-3 rounded-lg border border-base-300 bg-base-100 p-3 transition-colors hover:border-primary/40 hover:bg-base-200/40"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-mono text-[11px] uppercase tracking-wide text-base-content/50">
                    {move.projectDomain ?? move.projectName}
                    {move.targetUrl ? ` · ${pathOf(move.targetUrl)}` : ""}
                  </div>
                  <div className="font-medium leading-snug">{move.title}</div>
                  <div className="text-sm text-base-content/60">
                    {move.reason}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <BucketBadge bucket={move.valueBucket} />
                    <RiskBadge risk={move.riskTier} />
                    <StatusBadge status={move.status} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
                  <ScoreBar score={move.score} />
                  <ChevronRight className="size-4 text-base-content/30" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
