import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { AppError } from "@/server/lib/errors";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { SettingsRepository } from "@/custom/settings/repository";

async function assertProjectInOrg(projectId: string, organizationId: string) {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Project not found");
}

export const getMovesSettings = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const rows = await db
      .select({ id: projects.id, name: projects.name, domain: projects.domain })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, context.organizationId),
          isNull(projects.archivedAt),
        ),
      );
    const org = await SettingsRepository.getOrg(context.organizationId);
    const perProject = await Promise.all(
      rows.map(async (row) => ({
        project: row,
        settings: await SettingsRepository.getProject(row.id),
      })),
    );
    return { org, projects: perProject };
  });

const orgSchema = z.object({
  notifyEmail: z.boolean(),
  notifyPush: z.boolean(),
  notifyImessage: z.boolean(),
  // E.164-ish; the transport is happier with a full international number.
  imessageTo: z
    .string()
    .trim()
    .max(32)
    .regex(/^\+?[0-9 ()-]*$/, "Use digits, spaces, +, - and ( ) only")
    .nullable(),
  weeklyPlanDay: z.number().int().min(1).max(7),
  weeklyPlanHourUtc: z.number().int().min(0).max(23),
  monthlyBudgetUsd: z.number().min(0).max(10_000),
});

export const updateOrgMovesSettings = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(orgSchema)
  .handler(async ({ data, context }) =>
    SettingsRepository.updateOrg(context.organizationId, {
      ...data,
      imessageTo: data.imessageTo?.trim() || null,
    }),
  );

const projectSchema = z.object({
  projectId: z.string().min(1),
  valuePerLeadUsd: z.number().min(0).max(1_000_000),
  closeRate: z.number().min(0).max(1),
  siteConversionRate: z.number().min(0).max(1).nullable(),
  monthlyBudgetUsd: z.number().min(0).max(10_000),
  autoApplySafe: z.boolean(),
  reviewsBusinessName: z.string().trim().max(200).nullable(),
  reviewsLocationName: z.string().trim().max(200).nullable(),
});

export const updateProjectMovesSettings = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(projectSchema)
  .handler(async ({ data, context }) => {
    await assertProjectInOrg(data.projectId, context.organizationId);
    const { projectId, ...patch } = data;
    return SettingsRepository.updateProject(projectId, {
      ...patch,
      reviewsBusinessName: patch.reviewsBusinessName?.trim() || null,
      reviewsLocationName: patch.reviewsLocationName?.trim() || null,
    });
  });
