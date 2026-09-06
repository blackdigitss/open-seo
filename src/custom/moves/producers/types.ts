import type { Logger } from "@/custom/lib/log";
import type { SiteEconomics } from "@/custom/moves/score";
import type { MoveInput } from "@/custom/moves/types";

export type PageRole = "hub" | "spoke" | "money" | "other";

export type ProducerInput = {
  env: Cloudflare.Env;
  projectId: string;
  organizationId: string;
  domain: string | null;
  economics: SiteEconomics;
  /** Key pages by normalized URL, so a money page scores higher and never
   *  lands in the safe tier. */
  pageRoles: Map<string, PageRole>;
  /** Business overview + writing preferences, for LLM drafts. */
  voice: string;
  log: Logger;
};

/** `liveKeys` is every dedupe key this producer still sees; anything open from
 *  the same source that is missing gets resolved. `null` means the producer
 *  had no data to judge by (no completed audit, no grant) — resolve nothing,
 *  the same way upstream distinguishes "no issues found" from "no issue data"
 *  (their #290). */
export type ProducerResult = { moves: MoveInput[]; liveKeys: string[] | null };

/** Trailing slashes and case make the same page look like two. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin.toLowerCase()}${path}`;
  } catch {
    return url.replace(/\/+$/, "").toLowerCase();
  }
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/** Rank within a list, as 0..1 with the largest value at 1. */
export function percentile(index: number, total: number): number {
  if (total <= 1) return 1;
  return Number((1 - index / (total - 1)).toFixed(4));
}
