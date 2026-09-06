import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  applyMove,
  getMove,
  reopenMove,
  skipMove,
} from "@/custom/serverFunctions/moves";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { parseJson } from "@/custom/lib/json";
import type { Verdict } from "@/custom/moves/types";
import { BucketBadge, RiskBadge, StatusBadge } from "./MoveBadges";
import { CopyBlock } from "./CopyBlock";
import { pathOf, relativeTime, STATUS_LABELS } from "./format";

const EVIDENCE_LABELS: Record<string, string> = {
  query: "Search",
  page: "Page",
  impressions: "Impressions (28d)",
  clicks: "Clicks (28d)",
  position: "Average position",
  current: "Clicks now (28d)",
  prior: "Clicks before (28d)",
  lastYearCurrent: "Same window last year",
  upsideClicks: "Clicks if it reached top 3",
  severity: "Severity",
  issueType: "Issue",
  pageUrl: "Page",
  host: "Site",
  keyFile: "File to add",
};

function EvidenceRow({ label, value }: { label: string; value: unknown }) {
  const text =
    typeof value === "number"
      ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : String(value);
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-base-content/60">{label}</span>
      <span className="text-right font-medium tabular-nums">{text}</span>
    </div>
  );
}

export function MoveDetail({ moveId }: { moveId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const moveQuery = useQuery({
    queryKey: ["custom", "move", moveId],
    queryFn: () => getMove({ data: { moveId } }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["custom", "move", moveId],
    });
    void queryClient.invalidateQueries({ queryKey: ["custom", "moves"] });
    void queryClient.invalidateQueries({ queryKey: ["custom", "portfolio"] });
  };

  const done = useMutation({
    mutationFn: () => applyMove({ data: { moveId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Marked done — I'll check the page tomorrow morning.");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Couldn't save that.")),
  });
  const skip = useMutation({
    mutationFn: () => skipMove({ data: { moveId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Skipped.");
      void navigate({ to: "/moves" });
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Couldn't save that.")),
  });
  const reopen = useMutation({
    mutationFn: () => reopenMove({ data: { moveId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Reopened.");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Couldn't save that.")),
  });

  if (moveQuery.isLoading) {
    return <div className="skeleton h-64 w-full" />;
  }
  if (moveQuery.isError || !moveQuery.data) {
    return (
      <div className="alert alert-error">
        <span>
          {getStandardErrorMessage(
            moveQuery.error,
            "That move isn't available.",
          )}
        </span>
      </div>
    );
  }

  const move = moveQuery.data;
  const evidence = parseJson<Record<string, unknown>>(move.evidenceJson, {});
  const verdict = move.verdictJson
    ? parseJson<Verdict | null>(move.verdictJson, null)
    : null;
  const verifyResult = move.verifyResultJson
    ? parseJson<Record<string, unknown>>(move.verifyResultJson, {})
    : null;
  const evidenceRows = Object.entries(evidence).filter(
    ([key, value]) =>
      key in EVIDENCE_LABELS &&
      value !== null &&
      value !== undefined &&
      value !== "",
  );

  return (
    <div className="space-y-5 pb-8">
      <Link to="/moves" className="btn btn-ghost btn-sm gap-1 px-1">
        <ArrowLeft className="size-4" />
        All moves
      </Link>

      <header className="space-y-2">
        <div className="font-mono text-[11px] uppercase tracking-wide text-base-content/50">
          {move.projectDomain ?? move.projectName} · {move.type} · {move.source}
        </div>
        <h1 className="text-xl font-bold leading-tight">{move.title}</h1>
        <p className="text-sm text-base-content/70">{move.reason}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <BucketBadge bucket={move.valueBucket} />
          <RiskBadge risk={move.riskTier} />
          <StatusBadge status={move.status} />
        </div>
      </header>

      <p className="rounded-lg border-l-2 border-primary/50 bg-base-200/40 p-3 text-sm leading-relaxed">
        {move.hypothesis}
      </p>

      {move.status === "open" ? (
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-primary min-h-[44px] flex-1"
            disabled={done.isPending}
            onClick={() => done.mutate()}
          >
            {done.isPending ? "Saving…" : "Done"}
          </button>
          <button
            type="button"
            className="btn btn-ghost min-h-[44px]"
            disabled={skip.isPending}
            onClick={() => skip.mutate()}
          >
            Skip
          </button>
        </div>
      ) : move.status === "skipped" || move.status === "verify_failed" ? (
        <button
          type="button"
          className="btn btn-outline min-h-[44px] w-full"
          disabled={reopen.isPending}
          onClick={() => reopen.mutate()}
        >
          Reopen
        </button>
      ) : null}

      {move.snippet ? (
        <CopyBlock label="Paste this" value={move.snippet} />
      ) : null}
      {move.draft ? (
        <CopyBlock label="What to write" value={move.draft} mono={false} />
      ) : null}

      {move.whySafe ? (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
          <span className="font-semibold">Why this is safe: </span>
          {move.whySafe}
        </div>
      ) : null}

      {evidenceRows.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">Evidence</h3>
          <div className="divide-y divide-base-300 rounded-lg border border-base-300 px-3">
            {evidenceRows.map(([key, value]) => (
              <EvidenceRow
                key={key}
                label={EVIDENCE_LABELS[key] ?? key}
                value={value}
              />
            ))}
          </div>
        </section>
      ) : null}

      {verdict ? (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">Verdict</h3>
          <div className="rounded-lg border border-base-300 p-3 text-sm leading-relaxed">
            {verdict.summary}
          </div>
        </section>
      ) : null}

      {verifyResult && move.status === "verify_failed" ? (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">Verification</h3>
          <pre className="overflow-x-auto rounded-lg border border-error/30 bg-error/5 p-3 text-xs">
            {JSON.stringify(verifyResult, null, 2)}
          </pre>
        </section>
      ) : null}

      <section className="space-y-1 text-xs text-base-content/50">
        <div>Found {relativeTime(move.createdAt)}</div>
        {move.appliedAt ? (
          <div>Applied {relativeTime(move.appliedAt)}</div>
        ) : null}
        {move.verifiedAt ? (
          <div>
            {STATUS_LABELS[move.status] ?? move.status}{" "}
            {relativeTime(move.verifiedAt)}
          </div>
        ) : null}
        {move.reviewAt ? <div>Verdict due {move.reviewAt}</div> : null}
      </section>

      {move.targetUrl ? (
        <a
          href={move.targetUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost btn-sm gap-1"
        >
          <ExternalLink className="size-3.5" />
          {pathOf(move.targetUrl) || "View page"}
        </a>
      ) : null}
    </div>
  );
}
