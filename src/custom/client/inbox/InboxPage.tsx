import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, CalendarCheck, CircleAlert, Gavel } from "lucide-react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/custom/serverFunctions/notifications";
import { relativeTime } from "@/custom/client/moves/format";

const KIND_ICON = {
  weekly_plan: CalendarCheck,
  event: CircleAlert,
  verdict: Gavel,
  system: CircleAlert,
} as const;

export function InboxPage() {
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ["custom", "notifications"],
    queryFn: () => listNotifications(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["custom", "notifications"],
    });
    void queryClient.invalidateQueries({ queryKey: ["custom", "inboxBadge"] });
    void queryClient.invalidateQueries({ queryKey: ["custom", "portfolio"] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead({ data: { id } }),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  });

  const notifications = notificationsQuery.data ?? [];
  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-10 md:pb-10">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          {hasUnread ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </button>
          ) : null}
        </header>

        {notificationsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((n) => (
              <div key={n} className="skeleton h-20 w-full" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="card border border-base-300">
            <div className="card-body items-center gap-2 text-center">
              <BellOff className="size-8 text-base-content/30" />
              <p className="text-sm text-base-content/60">
                Your Monday plan lands here, along with anything urgent enough
                to interrupt you — a page that stopped verifying, a bad review,
                a verdict coming due.
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((notification) => {
              const Icon = KIND_ICON[notification.kind] ?? CircleAlert;
              const unread = !notification.readAt;
              const body = (
                <div className="flex gap-3">
                  <Icon
                    className={`mt-0.5 size-4 shrink-0 ${unread ? "text-primary" : "text-base-content/40"}`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`leading-snug ${unread ? "font-semibold" : ""}`}
                      >
                        {notification.title}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-base-content/40">
                        {relativeTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-base-content/60">
                      {notification.body}
                    </p>
                  </div>
                </div>
              );

              return (
                <li key={notification.id}>
                  {notification.moveId ? (
                    <Link
                      to="/moves/$moveId"
                      params={{ moveId: notification.moveId }}
                      className={`block min-h-[44px] rounded-lg border p-3 transition-colors hover:bg-base-200/40 ${unread ? "border-primary/30 bg-primary/5" : "border-base-300"}`}
                      onClick={() => markRead.mutate(notification.id)}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={`block w-full min-h-[44px] rounded-lg border p-3 text-left transition-colors hover:bg-base-200/40 ${unread ? "border-primary/30 bg-primary/5" : "border-base-300"}`}
                      onClick={() => markRead.mutate(notification.id)}
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default InboxPage;
