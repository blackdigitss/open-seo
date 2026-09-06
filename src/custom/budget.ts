// DataForSEO spend, recorded and capped. Self-host mode upstream discards the
// billing envelope; one FORK line in src/server/lib/dataforseo/client.ts calls
// recordDataforseoCost so every real charge lands in custom_dataforseo_calls.
// Scheduled jobs ask canSpend() before a paid pull; interactive use never
// blocks (the owner clicked, the owner pays).
import { gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { customDataforseoCalls } from "@/db/custom/schema";
import { isoNow, monthKey } from "@/custom/lib/time";
import { SettingsRepository } from "@/custom/settings/repository";

export async function recordDataforseoCost(
  billing: { path: string[]; costUsd: number } | null | undefined,
  feature?: string | null,
  attribution?: { projectId?: string | null; job?: string | null },
): Promise<void> {
  if (!billing || !Number.isFinite(billing.costUsd)) return;
  try {
    await db.insert(customDataforseoCalls).values({
      id: crypto.randomUUID(),
      at: isoNow(),
      path: billing.path.join("/"),
      costUsd: billing.costUsd,
      feature: feature ?? null,
      projectId: attribution?.projectId ?? null,
      job: attribution?.job ?? null,
    });
  } catch (error) {
    // Never let bookkeeping break the call that paid for it.
    console.error("[custom:budget] could not record cost", error);
  }
}

export async function monthToDateSpendUsd(now = new Date()): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${customDataforseoCalls.costUsd}), 0)`,
    })
    .from(customDataforseoCalls)
    .where(gte(customDataforseoCalls.at, `${monthKey(now)}-01`));
  return Number(row?.total ?? 0);
}

type SpendDecision = {
  allowed: boolean;
  spentUsd: number;
  budgetUsd: number;
  reason: string | null;
};

/** May a scheduled job spend roughly `estimateUsd` more this month? The cap is
 *  the organization's monthly budget for scheduled work; interactive use never
 *  goes through this — the owner clicked, the owner pays. */
export async function canSpend(
  organizationId: string,
  estimateUsd: number,
  now = new Date(),
): Promise<SpendDecision> {
  const settings = await SettingsRepository.getOrg(organizationId);
  const spentUsd = await monthToDateSpendUsd(now);
  const budgetUsd = settings.monthlyBudgetUsd;
  if (spentUsd + estimateUsd > budgetUsd) {
    return {
      allowed: false,
      spentUsd,
      budgetUsd,
      reason: `would exceed the $${budgetUsd}/month scheduled budget ($${spentUsd.toFixed(2)} spent, ~$${estimateUsd.toFixed(2)} more)`,
    };
  }
  return { allowed: true, spentUsd, budgetUsd, reason: null };
}

/** True when the Worker has a real DataForSEO key (the deploy uses a placeholder
 *  until the owner adds one). */
export function dataforseoConfigured(env: Cloudflare.Env): boolean {
  const key = env.DATAFORSEO_API_KEY?.trim();
  return Boolean(key && !key.startsWith("PLACEHOLDER"));
}
