// The corpus of what actually worked. Concluded verdicts append here; the
// draft generators read it back, so every future title or brief is written by
// something that has seen this portfolio's own wins and misses.
//
// Guard rails against turning noise into doctrine: only improved/declined
// verdicts qualify (the verdict layer already refuses to judge under 30
// clicks), every entry carries its sample size, the store is capped, and the
// prompt framing presents them as observations from n sites, never laws.
import { parseJson } from "@/custom/lib/json";

const MAX_ENTRIES = 40;

type Learning = {
  at: string;
  domain: string;
  source: string;
  moveTitle: string;
  reading: "improved" | "declined";
  changePct: number | null;
  seasonalChangePct: number | null;
  sampleClicks: number;
};

function kvKey(organizationId: string): string {
  return `custom:learnings:${organizationId}`;
}

export async function appendLearning(
  env: Cloudflare.Env,
  organizationId: string,
  learning: Learning,
): Promise<void> {
  const existing = parseJson<Learning[]>(
    await env.KV.get(kvKey(organizationId)),
    [],
  );
  existing.push(learning);
  await env.KV.put(
    kvKey(organizationId),
    JSON.stringify(existing.slice(-MAX_ENTRIES)),
  );
}

export async function loadLearnings(
  env: Cloudflare.Env,
  organizationId: string,
): Promise<Learning[]> {
  return parseJson<Learning[]>(await env.KV.get(kvKey(organizationId)), []);
}

/** The prompt block the draft generators include. Honest framing: these are
 *  observations with sample sizes, not rules. */
export function renderLearnings(learnings: Learning[]): string {
  if (learnings.length === 0) return "";
  const lines = learnings
    .slice(-12)
    .map((entry) => {
      const pct =
        entry.changePct === null
          ? ""
          : ` ${entry.changePct > 0 ? "+" : ""}${Math.round(entry.changePct * 100)}% clicks`;
      const seasonal =
        entry.seasonalChangePct === null
          ? ""
          : ` (same window last year: ${Math.round(entry.seasonalChangePct * 100)}%)`;
      return `- ${entry.at.slice(0, 7)} ${entry.domain} · ${entry.source} · "${entry.moveTitle}" → ${entry.reading}${pct}${seasonal} · n=${entry.sampleClicks} clicks`;
    })
    .join("\n");
  return [
    "Observed outcomes from this portfolio's own applied changes (small samples — treat as hints about what resonates here, not as laws):",
    lines,
  ].join("\n");
}
