// The Monday plan: what to do this week across every business, what verdicts
// are due, and what the data is costing. Sends nothing when there is nothing
// to say — a weekly "all quiet" is how a notification gets muted.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { monthToDateSpendUsd } from "@/custom/budget";
import { MovesRepository } from "@/custom/moves/repository";
import { formatBucket } from "@/custom/moves/score";
import { notify } from "@/custom/notify";
import { SettingsRepository } from "@/custom/settings/repository";
import { dayKey } from "@/custom/lib/time";
import type { JobDefinition } from "./runner";
import { weeklyOn } from "./schedule";

const MOVES_IN_PLAN = 8;

export const weeklyPlanJob: JobDefinition = {
  name: "weekly_plan",
  due: weeklyOn(1, 11, 30),
  run: async ({ env, now, log }) => {
    const orgs = await db
      .selectDistinct({ organizationId: projects.organizationId })
      .from(projects)
      .where(sql`${projects.archivedAt} is null`);

    const spentUsd = await monthToDateSpendUsd(now);
    let sent = 0;

    for (const { organizationId } of orgs) {
      const settings = await SettingsRepository.getOrg(organizationId);
      const open = await MovesRepository.listForOrganization(organizationId, {
        statuses: ["open"],
        limit: 200,
      });
      const dueVerdicts = (
        await MovesRepository.listDueForVerdict(dayKey(now))
      ).filter((row) => row.organizationId === organizationId);

      if (open.length === 0 && dueVerdicts.length === 0) {
        log("nothing to say", { organizationId });
        continue;
      }

      const top = open.slice(0, MOVES_IN_PLAN);
      const byProject = new Map<string, typeof top>();
      for (const move of top) {
        const key = move.projectDomain ?? move.projectName;
        byProject.set(key, [...(byProject.get(key) ?? []), move]);
      }

      const sections: string[] = [];
      for (const [project, moves] of byProject) {
        sections.push(
          [
            `**${project}**`,
            ...moves.map((move) => {
              const bucket = formatBucket(move.valueBucket);
              return `- ${move.title} — ${move.reason}${bucket ? ` (${bucket})` : ""}`;
            }),
          ].join("\n"),
        );
      }

      if (open.length > top.length) {
        sections.push(`_${open.length - top.length} more waiting._`);
      }
      if (dueVerdicts.length > 0) {
        sections.push(
          `**Verdicts due**\n${dueVerdicts
            .map((row) => `- ${row.move.title} (${row.projectName})`)
            .join("\n")}`,
        );
      }
      if (spentUsd > 0) {
        sections.push(
          `_Data spend this month: $${spentUsd.toFixed(2)} of $${settings.monthlyBudgetUsd.toFixed(0)}._`,
        );
      }

      await notify(env, {
        organizationId,
        kind: "weekly_plan",
        title:
          open.length > 0
            ? `This week: ${open.length} move${open.length === 1 ? "" : "s"}`
            : `This week: ${dueVerdicts.length} verdict${dueVerdicts.length === 1 ? "" : "s"} due`,
        body: sections.join("\n\n"),
        url: `${env.CUSTOM_APP_URL ?? ""}/moves`,
      });
      sent += 1;
    }

    return {
      organizations: orgs.length,
      sent,
      spentUsd: Number(spentUsd.toFixed(2)),
    };
  },
};
