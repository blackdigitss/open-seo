// Site-audit issues become Moves. Upstream already crawls, classifies and
// explains every issue; this maps its registry onto the risk tiers and
// verification expectations the apply loop needs.
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import { sort } from "remeda";
import { AUDIT_ISSUE_TYPES } from "@/shared/audit-issues";
import { draftTitleAndMeta } from "@/custom/moves/drafts";
import { scoreMove } from "@/custom/moves/score";
import type { MoveInput } from "@/custom/moves/types";
import {
  riskForIssue,
  SEVERITY_ORDINAL,
  verifyForIssue,
  type IssueSeverityName,
} from "./rules";
import {
  normalizeUrl,
  pathOf,
  type ProducerInput,
  type ProducerResult,
} from "./types";

const MAX_MOVES = 15;

type IssueType = keyof typeof AUDIT_ISSUE_TYPES;

export async function produceAuditMoves(
  input: ProducerInput,
): Promise<ProducerResult> {
  const audit = await AuditRepository.getLatestAuditForProject(input.projectId);
  if (!audit || audit.status !== "completed")
    return { moves: [], liveKeys: [] };

  const issues = await AuditRepository.getIssuesForAudit(audit.id, {});
  if (issues.length === 0) return { moves: [], liveKeys: [] };

  const pages = await AuditRepository.getPagesForAudit(audit.id);
  const titleByUrl = new Map(
    pages.map((page) => [normalizeUrl(page.url), page.title]),
  );

  const ranked = sort(
    issues,
    (a, b) =>
      SEVERITY_ORDINAL[b.severity as IssueSeverityName] -
      SEVERITY_ORDINAL[a.severity as IssueSeverityName],
  );

  const businessName = input.domain ?? "the business";
  const moves: MoveInput[] = [];
  const liveKeys: string[] = [];
  let drafted = 0;

  for (const issue of ranked) {
    const descriptor = AUDIT_ISSUE_TYPES[issue.issueType as IssueType];
    if (!descriptor) continue;
    const pageUrl = issue.pageUrl ?? "";
    const dedupeKey = `audit:${issue.issueType}:${pageUrl}`;
    liveKeys.push(dedupeKey);
    if (moves.length >= MAX_MOVES) continue;

    const normalized = normalizeUrl(pageUrl);
    const role = input.pageRoles.get(normalized) ?? null;
    const riskTier = riskForIssue(issue.issueType, role === "money");
    const scored = scoreMove({
      ordinal: SEVERITY_ORDINAL[issue.severity as IssueSeverityName] ?? 0.3,
      // Audit fixes protect traffic rather than adding a measurable amount;
      // the ordinal carries the ranking and the bucket stays honest.
      upsideClicks: 0,
      economics: input.economics,
      pageRole: role,
    });

    // Only the title/meta family gets generated copy, and only for the first
    // few — an LLM call per issue would make a big audit slow and expensive.
    let snippet: string | null = null;
    const needsCopy =
      riskTier === "safe" &&
      drafted < 5 &&
      /title|meta-description/.test(issue.issueType);
    if (needsCopy) {
      drafted += 1;
      const draft = await draftTitleAndMeta(input.env, {
        query: pathOf(pageUrl).replace(/[-/]+/g, " ").trim() || businessName,
        url: pageUrl,
        businessName,
        voice: input.voice,
        currentTitle: titleByUrl.get(normalized) ?? null,
      });
      snippet = issue.issueType.includes("meta-description")
        ? `<meta name="description" content="${draft.metaDescription.replace(/"/g, "&quot;")}">`
        : `<title>${draft.title}</title>`;
    }

    moves.push({
      projectId: input.projectId,
      dedupeKey,
      type: "fix",
      source: "audit",
      title: `${descriptor.title}${pageUrl ? ` — ${pathOf(pageUrl)}` : ""}`,
      hypothesis: descriptor.explanation,
      reason: `${issue.severity} · from the ${audit.completedAt?.slice(0, 10) ?? "latest"} audit`,
      evidence: {
        auditId: audit.id,
        issueType: issue.issueType,
        severity: issue.severity,
        pageUrl,
        details: issue.detailsJson ?? null,
        verify: verifyForIssue(issue.issueType),
      },
      targetUrl: pageUrl || null,
      draft: descriptor.howToFix,
      snippet,
      whySafe:
        riskTier === "safe"
          ? "Adds or rewrites a tag; how the page is indexed doesn't change."
          : null,
      riskTier,
      score: scored.score,
      scoreInputs: scored.inputs,
      valueBucket: scored.valueBucket,
      verifyUrl: pageUrl || null,
    });
  }

  return { moves, liveKeys };
}
