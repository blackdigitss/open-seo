import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { updateOrgMovesSettings } from "@/custom/serverFunctions/settings";
import type { OrgSettings } from "@/custom/settings/repository";
import { Field, NumberField, TextField, Toggle } from "./fields";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type FormState = {
  notifyEmail: boolean;
  notifyPush: boolean;
  notifyImessage: boolean;
  imessageTo: string;
  weeklyPlanDay: number;
  weeklyPlanHourUtc: number;
  monthlyBudgetUsd: number;
};

export function NotificationSettings({ initial }: { initial: OrgSettings }) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<FormState>({
    notifyEmail: initial.notifyEmail,
    notifyPush: initial.notifyPush,
    notifyImessage: initial.notifyImessage,
    imessageTo: initial.imessageTo ?? "",
    weeklyPlanDay: initial.weeklyPlanDay,
    weeklyPlanHourUtc: initial.weeklyPlanHourUtc,
    monthlyBudgetUsd: initial.monthlyBudgetUsd,
  });

  const patch = (next: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...next }));

  const save = useMutation({
    mutationFn: () =>
      updateOrgMovesSettings({
        data: { ...form, imessageTo: form.imessageTo.trim() || null },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["custom", "movesSettings"],
      });
      toast.success("Notification settings saved");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Couldn't save that.")),
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">How you hear from it</h2>
        <p className="text-sm text-base-content/60">
          The weekly plan, plus anything urgent enough to interrupt. Nothing is
          sent when there's nothing to say.
        </p>
      </div>

      <div className="divide-y divide-base-300 rounded-lg border border-base-300 px-4">
        <Toggle
          label="Email"
          checked={form.notifyEmail}
          onChange={(notifyEmail) => patch({ notifyEmail })}
        />
        <Toggle
          label="Push"
          hint="Needs the app installed to your home screen on iPhone"
          checked={form.notifyPush}
          onChange={(notifyPush) => patch({ notifyPush })}
        />
        <Toggle
          label="iMessage"
          hint="Requires a running BlueBubbles server"
          checked={form.notifyImessage}
          onChange={(notifyImessage) => patch({ notifyImessage })}
        />
      </div>

      {form.notifyImessage ? (
        <TextField
          label="Send iMessage to"
          hint="Phone number, e.g. +12125550123"
          type="tel"
          value={form.imessageTo}
          onChange={(imessageTo) => patch({ imessageTo })}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Plan day">
          <select
            className="select select-bordered w-full"
            value={form.weeklyPlanDay}
            onChange={(event) =>
              patch({ weeklyPlanDay: Number(event.target.value) })
            }
          >
            {DAYS.map((day, index) => (
              <option key={day} value={index + 1}>
                {day}
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label="Hour (UTC)"
          min={0}
          max={23}
          value={form.weeklyPlanHourUtc}
          onChange={(value) => patch({ weeklyPlanHourUtc: Number(value) })}
        />
        <NumberField
          label="Monthly data budget ($)"
          hint="Scheduled work stops here"
          min={0}
          value={form.monthlyBudgetUsd}
          onChange={(value) => patch({ monthlyBudgetUsd: Number(value) })}
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
