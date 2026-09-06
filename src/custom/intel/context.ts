// Shared plumbing for the paid jobs: the projects they iterate and the
// billing-context shape upstream's client wants (self-host never bills through
// it, but the cache keys and typing come from here).
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import type { BillingCustomerContext } from "@/server/billing/subscription";

type IntelProject = {
  id: string;
  organizationId: string;
  name: string;
  domain: string | null;
  locationCode: number;
  languageCode: string;
};

export async function listIntelProjects(): Promise<IntelProject[]> {
  return db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      name: projects.name,
      domain: projects.domain,
      locationCode: projects.locationCode,
      languageCode: projects.languageCode,
    })
    .from(projects)
    .where(sql`${projects.archivedAt} is null`);
}

export function billingContextFor(project: {
  organizationId: string;
  id: string;
}): BillingCustomerContext {
  return {
    organizationId: project.organizationId,
    // The scheduled worker acts for the organization, not a person.
    userId: "custom-jobs",
    userEmail: "jobs@openseo-custom",
    projectId: project.id,
  };
}

/** One `system` notification per job per month when the budget pauses it. */
export async function notifyBudgetPauseOnce(
  env: Cloudflare.Env,
  input: {
    organizationId: string;
    job: string;
    monthKey: string;
    reason: string;
  },
): Promise<boolean> {
  const kvKey = `custom:budget_paused:${input.job}:${input.organizationId}:${input.monthKey}`;
  if (await env.KV.get(kvKey)) return false;
  await env.KV.put(kvKey, "1", { expirationTtl: 40 * 24 * 3600 });
  return true;
}
