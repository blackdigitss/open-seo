import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, CircleCheck } from "lucide-react";
import { getPortfolio } from "@/custom/serverFunctions/portfolio";
import { BucketBadge, RiskBadge } from "@/custom/client/moves/MoveBadges";

/** Every business on one screen, ordered by what needs you — replacing the
 *  redirect that used to drop you into whichever project you saw last. */
export function PortfolioHome() {
  const portfolioQuery = useQuery({
    queryKey: ["custom", "portfolio"],
    queryFn: () => getPortfolio(),
  });

  const data = portfolioQuery.data;
  const totalOpen =
    data?.projects.reduce((sum, project) => sum + project.openCount, 0) ?? 0;

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-10 md:pb-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Today</h1>
            <p className="mt-1 text-sm text-base-content/60">
              {portfolioQuery.isLoading
                ? "Loading…"
                : totalOpen === 0
                  ? "Nothing needs you right now."
                  : `${totalOpen} move${totalOpen === 1 ? "" : "s"} across ${data?.projects.length} site${data?.projects.length === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Link to="/inbox" className="btn btn-ghost btn-sm gap-1">
            <Bell className="size-4" />
            {data?.unreadNotifications ? (
              <span className="badge badge-primary badge-sm">
                {data.unreadNotifications}
              </span>
            ) : null}
          </Link>
        </header>

        {portfolioQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((n) => (
              <div key={n} className="skeleton h-32 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data?.projects.map((project) => (
              <div
                key={project.id}
                className="card border border-base-300 bg-base-100"
              >
                <div className="card-body gap-3 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      to="/p/$projectId"
                      params={{ projectId: project.id }}
                      className="font-semibold hover:underline"
                    >
                      {project.domain ?? project.name}
                    </Link>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-base-content/50">
                      {project.openCount} open
                    </span>
                  </div>

                  {project.topMove ? (
                    <Link
                      to="/moves/$moveId"
                      params={{ moveId: project.topMove.id }}
                      className="block space-y-1.5 rounded-lg bg-base-200/50 p-3 transition-colors hover:bg-base-200"
                    >
                      <div className="text-sm font-medium leading-snug">
                        {project.topMove.title}
                      </div>
                      <div className="text-xs text-base-content/60">
                        {project.topMove.reason}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <BucketBadge bucket={project.topMove.valueBucket} />
                        <RiskBadge risk={project.topMove.riskTier} />
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-base-200/40 p-3 text-sm text-base-content/60">
                      <CircleCheck className="size-4 text-success" />
                      Nothing outstanding
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-base-content/50">
                    <span>
                      {project.appliedCount} awaiting a verdict ·{" "}
                      {project.concludedCount} concluded
                    </span>
                    <Link
                      to="/p/$projectId/moves"
                      params={{ projectId: project.id }}
                      className="link inline-flex items-center gap-0.5"
                    >
                      All
                      <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalOpen > 0 ? (
          <Link to="/moves" className="btn btn-primary w-full md:w-auto">
            Work through {totalOpen} move{totalOpen === 1 ? "" : "s"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default PortfolioHome;
