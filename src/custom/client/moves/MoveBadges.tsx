import { ShieldCheck, TriangleAlert } from "lucide-react";
import {
  bucketBadgeClass,
  formatBucket,
  STATUS_LABELS,
  statusBadgeClass,
} from "./format";

export function BucketBadge({
  bucket,
}: {
  bucket: "low" | "mid" | "high" | null;
}) {
  if (!bucket) return null;
  return (
    <span className={`badge badge-sm ${bucketBadgeClass(bucket)}`}>
      {formatBucket(bucket)}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: "safe" | "risky" }) {
  return risk === "safe" ? (
    <span className="badge badge-sm badge-success gap-1">
      <ShieldCheck className="size-3" />
      Safe
    </span>
  ) : (
    <span className="badge badge-sm badge-warning gap-1">
      <TriangleAlert className="size-3" />
      Needs review
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "open") return null;
  return (
    <span className={`badge badge-sm ${statusBadgeClass(status)}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
