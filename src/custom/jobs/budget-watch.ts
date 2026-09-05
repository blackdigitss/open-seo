// Once a day: if scheduled DataForSEO spend has crossed 80% of the month's
// budget, say so once. The jobs themselves stop at 100% via canSpend().
import { db } from "@/db";
import { projects } from "@/db/schema";
import { monthToDateSpendUsd } from "@/custom/budget";
import { monthKey } from "@/custom/lib/time";
import { notify } from "@/custom/notify";
import { SettingsRepository } from "@/custom/settings/repository";
import type { JobDefinition } from "./runner";
import { dailyAfter } from "./schedule";

export const budgetWatchJob: JobDefinition = {
  name: "budget_watch",
  due: dailyAfter(10),
  run: async ({ env, now, log }) => {
    const spentUsd = await monthToDateSpendUsd(now);
    const orgs = await db
      .selectDistinct({ organizationId: projects.organizationId })
      .from(projects);
    let alerted = 0;
    for (const { organizationId } of orgs) {
      const settings = await SettingsRepository.getOrg(organizationId);
      const budget = settings.monthlyBudgetUsd;
      if (budget <= 0 || spentUsd < 0.8 * budget) continue;
      const kvKey = `custom:budget_alert:${organizationId}:${monthKey(now)}`;
      if (await env.KV.get(kvKey)) continue;
      const pct = Math.round((spentUsd / budget) * 100);
      await notify(env, {
        organizationId,
        kind: "event",
        title: `DataForSEO spend at ${pct}% of this month's budget`,
        body: `$${spentUsd.toFixed(2)} of $${budget.toFixed(0)} used. Scheduled jobs stop at 100%; anything you run by hand still goes through. Raise the budget in Settings → Moves if this is expected.`,
        url: `${env.CUSTOM_APP_URL ?? ""}/settings/moves`,
      });
      await env.KV.put(kvKey, "1", { expirationTtl: 40 * 24 * 3600 });
      alerted += 1;
      log("alerted", { organizationId, spentUsd, budget });
    }
    return { spentUsd: Number(spentUsd.toFixed(2)), alerted };
  },
};
