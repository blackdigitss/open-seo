import { formatBucket } from "@/custom/moves/score";

export { formatBucket };

export function pathOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

/** "just now", "3h ago", "5 Sep" — short enough for a list row. */
export function relativeTime(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  applied: "Applied",
  verified: "Verified",
  verify_failed: "Not verified",
  skipped: "Skipped",
  resolved: "Resolved on its own",
  concluded: "Concluded",
};

export function bucketBadgeClass(
  bucket: "low" | "mid" | "high" | null,
): string {
  switch (bucket) {
    case "high":
      return "badge-primary";
    case "mid":
      return "badge-neutral";
    case "low":
      return "badge-ghost";
    default:
      return "badge-ghost";
  }
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "verified":
      return "badge-success";
    case "verify_failed":
      return "badge-error";
    case "applied":
      return "badge-info";
    case "concluded":
      return "badge-neutral";
    default:
      return "badge-ghost";
  }
}
