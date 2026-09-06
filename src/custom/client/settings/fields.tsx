import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="form-control w-full">
      <div className="label py-1">
        <span className="label-text">{label}</span>
      </div>
      {children}
      {hint ? (
        <div className="label py-1">
          <span className="label-text-alt text-base-content/50">{hint}</span>
        </div>
      ) : null}
    </label>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-sm">{label}</span>
        {hint ? (
          <span className="block text-xs text-base-content/50">{hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="toggle toggle-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  hint?: string;
  value: number | string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className="input input-bordered w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "tel";
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type={type}
        className="input input-bordered w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
