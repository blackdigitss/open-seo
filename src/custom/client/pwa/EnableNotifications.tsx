import { Bell, Share } from "lucide-react";
import { toast } from "sonner";
import { usePush } from "./usePush";

/** Offered where notifications are the point (the Inbox). Silent when push is
 *  already on, unsupported, or not yet configured on the server. */
export function EnableNotifications() {
  const push = usePush();

  if (!push.supported || push.subscribed) return null;

  if (push.needsInstall) {
    return (
      <div className="alert alert-info items-start text-sm">
        <Share className="size-4 shrink-0" />
        <span>
          To get notifications on iPhone, add OpenSEO to your home screen first
          — tap Share, then <strong>Add to Home Screen</strong>, and open it
          from there.
        </span>
      </div>
    );
  }

  if (!push.available || push.permission === "denied") return null;

  return (
    <button
      type="button"
      className="btn btn-outline btn-sm min-h-[44px] w-full gap-2"
      disabled={push.busy}
      onClick={() => {
        void push.subscribe().then((ok) => {
          if (ok) toast.success("Notifications on.");
          else if (Notification.permission === "denied") {
            toast.error("Notifications are blocked in your browser settings.");
          }
        });
      }}
    >
      <Bell className="size-4" />
      {push.busy ? "Turning on…" : "Turn on notifications"}
    </button>
  );
}
