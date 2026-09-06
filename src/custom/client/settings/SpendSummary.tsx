import { useQuery } from "@tanstack/react-query";
import { getSpendSummary } from "@/custom/serverFunctions/history";

/** What the data actually cost this month, from the real billing envelopes —
 *  the numbers self-host mode used to throw away. */
export function SpendSummary() {
  const spendQuery = useQuery({
    queryKey: ["custom", "spend"],
    queryFn: () => getSpendSummary(),
  });

  const data = spendQuery.data;
  if (!data || data.totalCalls === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Data spend this month</h2>
        <p className="text-sm text-base-content/60">
          ${data.totalUsd.toFixed(2)} across {data.totalCalls.toLocaleString()}{" "}
          calls. Repeats of a recent lookup are served from cache and cost
          nothing.
        </p>
      </div>
      <div className="divide-y divide-base-300 rounded-lg border border-base-300 px-3">
        {data.byFeature.map((row) => (
          <div
            key={row.feature}
            className="flex items-baseline justify-between gap-4 py-2 text-sm"
          >
            <span className="capitalize">
              {row.feature.replace(/_/g, " ")}
              <span className="ml-2 text-xs text-base-content/50">
                {row.calls} call{row.calls === 1 ? "" : "s"}
              </span>
            </span>
            <span className="font-mono tabular-nums">
              ${row.costUsd.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
