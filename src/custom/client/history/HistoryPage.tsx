import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  MessageSquareQuote,
  Sparkles,
  Split,
  TrendingUp,
} from "lucide-react";
import { getProjectHistory } from "@/custom/serverFunctions/history";
import { parseJson } from "@/custom/lib/json";

const KIND_META: Record<string, { label: string; icon: typeof Sparkles }> = {
  brand_lookup: { label: "AI visibility", icon: Sparkles },
  brand_volume: { label: "Brand searches", icon: TrendingUp },
  competitor_gap: { label: "Competitor gaps", icon: Split },
  reviews_summary: { label: "Reviews", icon: MessageSquareQuote },
  rank_grid: { label: "Local rank grid", icon: Archive },
};

function describe(kind: string, summary: Record<string, unknown>): string {
  switch (kind) {
    case "brand_lookup": {
      const share = summary.sharePct;
      const mentions = summary.totalMentions;
      return [
        typeof share === "number"
          ? `${share.toFixed(0)}% share of voice`
          : null,
        typeof mentions === "number" ? `${mentions} AI mentions` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "brand_volume":
      return typeof summary.total === "number"
        ? `${summary.total.toLocaleString()} brand searches/mo`
        : "";
    case "competitor_gap":
      return typeof summary.gapCount === "number"
        ? `${summary.gapCount} keywords competitors rank for that you don't`
        : "";
    case "reviews_summary": {
      const avg = summary.averageRating;
      return [
        typeof summary.count === "number" ? `${summary.count} reviews` : null,
        typeof avg === "number" ? `${avg.toFixed(1)}★ average` : null,
        typeof summary.unanswered === "number"
          ? `${summary.unanswered} unanswered`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    default:
      return "";
  }
}

/** Every dated analysis this project has paid for, kept forever. Reading it
 *  again is free; the date says how old it is, and re-running the analysis is
 *  the deliberate way to pay for fresh numbers. */
export function HistoryPage({ projectId }: { projectId: string }) {
  const historyQuery = useQuery({
    queryKey: ["custom", "history", projectId],
    queryFn: () => getProjectHistory({ data: { projectId } }),
  });

  const snapshots = historyQuery.data ?? [];

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-10 md:pb-10">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-base-content/60">
            Every analysis that cost money, kept with its date. Reading it here
            is free — only fresh data is paid for.
          </p>
        </header>

        {historyQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((n) => (
              <div key={n} className="skeleton h-16 w-full" />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <div className="card border border-base-300">
            <div className="card-body items-center gap-2 text-center">
              <Archive className="size-8 text-base-content/30" />
              <p className="text-sm text-base-content/60">
                Nothing yet. The monthly brand snapshot, weekly review scans and
                competitor-gap runs land here as they happen — each one dated,
                so growth is visible over time.
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {snapshots.map((snapshot) => {
              const meta = KIND_META[snapshot.kind] ?? {
                label: snapshot.kind,
                icon: Archive,
              };
              const Icon = meta.icon;
              return (
                <li
                  key={snapshot.id}
                  className="flex items-start gap-3 rounded-lg border border-base-300 p-3"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-base-content/40" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{meta.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-base-content/50">
                        {snapshot.takenAt.slice(0, 10)}
                      </span>
                    </div>
                    <p className="text-sm text-base-content/60">
                      {describe(
                        snapshot.kind,
                        parseJson<Record<string, unknown>>(
                          snapshot.summaryJson,
                          {},
                        ),
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
