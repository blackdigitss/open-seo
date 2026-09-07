import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customOrgSettings, customProjectSettings } from "@/db/custom/schema";
import { isoNow } from "@/custom/lib/time";
import { DEFAULT_ECONOMICS, type SiteEconomics } from "@/custom/moves/score";

export type OrgSettings = typeof customOrgSettings.$inferSelect;
export type ProjectSettings = typeof customProjectSettings.$inferSelect;

const ORG_DEFAULTS = {
  notifyEmail: true,
  notifyPush: true,
  notifyImessage: false,
  imessageTo: null,
  weeklyPlanDay: 1,
  weeklyPlanHourUtc: 11,
  monthlyBudgetUsd: 25,
} as const;

const PROJECT_DEFAULTS = {
  valuePerLeadUsd: DEFAULT_ECONOMICS.valuePerLeadUsd,
  closeRate: DEFAULT_ECONOMICS.closeRate,
  siteConversionRate: null,
  monthlyBudgetUsd: 10,
  autoApplySafe: false,
  reviewsBusinessName: null,
  reviewsLocationName: null,
  indexnowKey: null,
} as const;

async function getOrg(organizationId: string): Promise<OrgSettings> {
  const [row] = await db
    .select()
    .from(customOrgSettings)
    .where(eq(customOrgSettings.organizationId, organizationId))
    .limit(1);
  return row ?? { organizationId, ...ORG_DEFAULTS, updatedAt: isoNow() };
}

async function updateOrg(
  organizationId: string,
  patch: Partial<Omit<OrgSettings, "organizationId" | "updatedAt">>,
): Promise<OrgSettings> {
  const now = isoNow();
  const [row] = await db
    .insert(customOrgSettings)
    .values({ organizationId, ...ORG_DEFAULTS, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: customOrgSettings.organizationId,
      set: { ...patch, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error("upsert returned no row");
  return row;
}

async function getProject(projectId: string): Promise<ProjectSettings> {
  const [row] = await db
    .select()
    .from(customProjectSettings)
    .where(eq(customProjectSettings.projectId, projectId))
    .limit(1);
  return row ?? { projectId, ...PROJECT_DEFAULTS, updatedAt: isoNow() };
}

async function updateProject(
  projectId: string,
  patch: Partial<Omit<ProjectSettings, "projectId" | "updatedAt">>,
): Promise<ProjectSettings> {
  const now = isoNow();
  const [row] = await db
    .insert(customProjectSettings)
    .values({ projectId, ...PROJECT_DEFAULTS, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: customProjectSettings.projectId,
      set: { ...patch, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error("upsert returned no row");
  return row;
}

/** The site multiplier inputs, with the GA4-derived conversion rate the caller
 *  observed (if any) filling the gap when the owner set none. */
function economicsFor(
  settings: ProjectSettings,
  observedConversionRate: number | null,
): SiteEconomics {
  return {
    valuePerLeadUsd: settings.valuePerLeadUsd,
    closeRate: settings.closeRate,
    siteConversionRate:
      settings.siteConversionRate ??
      observedConversionRate ??
      DEFAULT_ECONOMICS.siteConversionRate,
  };
}

export const SettingsRepository = {
  getOrg,
  updateOrg,
  getProject,
  updateProject,
  economicsFor,
};
