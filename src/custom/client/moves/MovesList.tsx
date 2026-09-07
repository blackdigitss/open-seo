import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ClipboardCheck,
  Inbox,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { listMoves } from "@/custom/serverFunctions/moves";
import type { MoveRow, MoveStatus } from "@/custom/moves/types";
import { BucketBadge, RiskBadge, StatusBadge } from "./MoveBadges";
import { pathOf } from "./format";

const FILTERS: Array<{ label: string; statuses: MoveStatus[] }> = [
  { label: "To do", statuses: ["open"] },
  { label: "In flight", statuses: ["applied", "verified", "verify_failed"] },
  { label: "Done", statuses: ["concluded", "skipped", "resolved"] },
];

/** What kind of work this is, at a glance. */
const SOURCE_META: Record<
  MoveRow["source"],
  { icon: typeof Wrench; tint: string; label: string }
> = {
  striking_distance: {
    icon: TrendingUp,
    tint: "bg-primary/10 text-primary",
    label: "Opening",
  },
  opportunity: {
    icon: Sparkles,
    tint: "bg-primary/10 text-primary",
    label: "Opening",
  },
  decay: { icon: Wrench, tint: "bg-warning/15 text-warning", label: "Refresh" },
  audit: { icon: Wrench, tint: "bg-warning/15 text-warning", label: "Fix" },
  review: {
    icon: Wrench,
    tint: "bg-warning/15 text-warning",
    label: "Reviews",
  },
  rank: { icon: TrendingUp, tint: "bg-primary/10 text-primary", label: "Rank" },
  setup: {
    icon: ClipboardCheck,
    tint: "bg-base-content/10 text-base-content/70",
    label: "Setup",
  },
  manual: {
    icon: ClipboardCheck,
    tint: "bg-base-content/10 text-base-content/70",
    label: "Task",
  },
};

function MoveCard({
  move,
  showProject,
}: {
  move: MoveRow & { projectName: string; projectDomain: string | null };
  showProject: boolean;
}) {
  const meta = SOURCE_META[move.source] ?? SOURCE_META.manual;
  const Icon = meta.icon;
  const where = [
    showProject ? (move.projectDomain ?? move.projectName) : null,
    move.targetUrl ? pathOf(move.targetUrl) : null,
    move.targetQuery ? `"${move.targetQuery}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      to="/moves/$moveId"
      params={{ moveId: move.id }}
      className="flex items-center gap-3 rounded-xl border border-base-300 bg-base-100 p-3.5 transition-colors hover:border-primary/40 active:bg-base-200/60"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${meta.tint}`}
        aria-hidden
      >
        <Icon className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        {where ? (
          <span className="block truncate font-mono text-[11px] text-base-content/50">
            {where}
          </span>
        ) : null}
        <span className="block font-medium leading-snug">{move.title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-base-content/60">
          {move.reason}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <BucketBadge bucket={move.valueBucket} />
          <RiskBadge risk={move.riskTier} />
          <StatusBadge status={move.status} />
        </span>
      </span>

      <ChevronRight className="size-5 shrink-0 text-base-content/30" />
    </Link>
  );
}

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
            <div key={n} className="skeleton h-24 w-full" />
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
        <ul className="flex flex-col gap-2.5">
          {moves.map((move) => (
            <li key={move.id}>
              <MoveCard move={move} showProject={!projectId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
