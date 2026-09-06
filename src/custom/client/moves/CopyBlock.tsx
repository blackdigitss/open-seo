import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

/** A block of text the owner is meant to paste somewhere, with the one control
 *  that matters on a phone. */
export function CopyBlock({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually.");
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <button
          type="button"
          className="btn btn-ghost btn-xs min-h-[36px] gap-1"
          onClick={() => void copy()}
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={`overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-base-300 bg-base-200/60 p-3 text-xs ${mono ? "font-mono" : "font-sans"}`}
      >
        {value}
      </pre>
    </section>
  );
}
