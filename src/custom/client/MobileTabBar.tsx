import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, House, ListChecks, PanelsTopLeft } from "lucide-react";
import { getLastProjectId } from "@/client/lib/active-project";
import { getInboxBadge } from "@/custom/serverFunctions/push";
import { getPortfolio } from "@/custom/serverFunctions/portfolio";

const LINK_CLASS =
  "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] text-base-content/60 transition-colors";
const ACTIVE_CLASS = "text-primary";

/** Thumb-first navigation below `md`. The desktop sidebar keeps its job above
 *  that breakpoint. */
function MobileTabBar() {
  const [lastProjectId, setLastProjectId] = React.useState<string | null>(null);
  React.useEffect(() => {
    setLastProjectId(getLastProjectId());
  }, []);
  // A fresh install has an empty localStorage (its own partition), so fall
  // back to the portfolio's top project rather than hiding the tab.
  const portfolioQuery = useQuery({
    queryKey: ["custom", "portfolio"],
    queryFn: () => getPortfolio(),
    enabled: lastProjectId === null,
    staleTime: 5 * 60_000,
  });
  const projectId =
    lastProjectId ?? portfolioQuery.data?.projects[0]?.id ?? null;

  const badgeQuery = useQuery({
    queryKey: ["custom", "inboxBadge"],
    queryFn: () => getInboxBadge(),
    refetchInterval: 60_000,
  });
  const unread = badgeQuery.data?.unread ?? 0;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-base-300 bg-base-100 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main"
    >
      <Link
        to="/"
        className={LINK_CLASS}
        activeOptions={{ exact: true }}
        activeProps={{ className: `${LINK_CLASS} ${ACTIVE_CLASS}` }}
      >
        <House className="size-5" />
        Home
      </Link>
      <Link
        to="/moves"
        className={LINK_CLASS}
        activeProps={{ className: `${LINK_CLASS} ${ACTIVE_CLASS}` }}
      >
        <ListChecks className="size-5" />
        Moves
      </Link>
      <Link
        to="/inbox"
        className={LINK_CLASS}
        activeProps={{ className: `${LINK_CLASS} ${ACTIVE_CLASS}` }}
      >
        <span className="relative">
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute -right-2 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-content">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </span>
        Inbox
      </Link>
      {projectId ? (
        <Link
          to="/p/$projectId"
          params={{ projectId }}
          className={LINK_CLASS}
          activeProps={{ className: `${LINK_CLASS} ${ACTIVE_CLASS}` }}
        >
          <PanelsTopLeft className="size-5" />
          Site
        </Link>
      ) : null}
    </nav>
  );
}

export default MobileTabBar;
