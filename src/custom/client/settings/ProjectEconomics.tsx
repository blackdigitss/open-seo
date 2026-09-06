import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { updateProjectMovesSettings } from "@/custom/serverFunctions/settings";
import type { ProjectSettings } from "@/custom/settings/repository";
import { Field, NumberField, TextField } from "./fields";

export type ProjectRow = {
  project: { id: string; name: string; domain: string | null };
  settings: ProjectSettings;
};

type FormState = {
  valuePerLeadUsd: number;
  closeRate: number;
  siteConversionRate: string;
  monthlyBudgetUsd: number;
  reviewsBusinessName: string;
  reviewsLocationName: string;
};

function toForm(settings: ProjectSettings): FormState {
  return {
    valuePerLeadUsd: settings.valuePerLeadUsd,
    closeRate: settings.closeRate,
    siteConversionRate:
      settings.siteConversionRate === null
        ? ""
        : String(settings.siteConversionRate),
    monthlyBudgetUsd: settings.monthlyBudgetUsd,
    reviewsBusinessName: settings.reviewsBusinessName ?? "",
    reviewsLocationName: settings.reviewsLocationName ?? "",
  };
}

export function ProjectEconomics({ rows }: { rows: ProjectRow[] }) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = React.useState(rows[0]?.project.id ?? "");
  const selected = rows.find((row) => row.project.id === projectId) ?? rows[0];
  const [form, setForm] = React.useState<FormState>(() =>
    toForm(rows[0].settings),
  );

  // Switching project swaps the whole form.
  React.useEffect(() => {
    if (selected) setForm(toForm(selected.settings));
  }, [selected]);

  const patch = (next: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...next }));

  const save = useMutation({
    mutationFn: () => {
      const rate = form.siteConversionRate.trim();
      return updateProjectMovesSettings({
        data: {
          projectId,
          valuePerLeadUsd: form.valuePerLeadUsd,
          closeRate: form.closeRate,
          siteConversionRate: rate === "" ? null : Number(rate),
          monthlyBudgetUsd: form.monthlyBudgetUsd,
          reviewsBusinessName: form.reviewsBusinessName.trim() || null,
          reviewsLocationName: form.reviewsLocationName.trim() || null,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["custom", "movesSettings"],
      });
      toast.success("Project settings saved");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Couldn't save that.")),
  });

  if (!selected) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">What a lead is worth</h2>
        <p className="text-sm text-base-content/60">
          This is what lets moves from different businesses be ranked against
          each other. Rough numbers are fine — they only have to get the order
          right.
        </p>
      </div>

      <Field label="Project">
        <select
          className="select select-bordered w-full"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          {rows.map((row) => (
            <option key={row.project.id} value={row.project.id}>
              {row.project.domain ?? row.project.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Value per lead ($)"
          min={0}
          value={form.valuePerLeadUsd}
          onChange={(value) => patch({ valuePerLeadUsd: Number(value) })}
        />
        <NumberField
          label="Close rate (0–1)"
          hint="0.5 means you win half of them"
          min={0}
          max={1}
          step={0.05}
          value={form.closeRate}
          onChange={(value) => patch({ closeRate: Number(value) })}
        />
        <NumberField
          label="Site conversion rate"
          hint="Blank uses Google Analytics, or 2%"
          min={0}
          max={1}
          step={0.005}
          value={form.siteConversionRate}
          onChange={(siteConversionRate) => patch({ siteConversionRate })}
        />
        <NumberField
          label="Project data budget ($/mo)"
          min={0}
          value={form.monthlyBudgetUsd}
          onChange={(value) => patch({ monthlyBudgetUsd: Number(value) })}
        />
        <TextField
          label="Google Business name"
          hint="Enables weekly review monitoring"
          value={form.reviewsBusinessName}
          onChange={(reviewsBusinessName) => patch({ reviewsBusinessName })}
        />
        <TextField
          label="Business location"
          hint='e.g. "New York,New York,United States"'
          value={form.reviewsLocationName}
          onChange={(reviewsLocationName) => patch({ reviewsLocationName })}
        />
      </div>

      <button
        type="button"
        className="btn btn-primary min-h-[44px]"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
