// Edge rule model + the pure logic, kept leaf-clean for tests. The worker
// applies these; the auto-apply job writes them; KV carries them per host.
export type EdgeRule = {
  id: string;
  moveId: string;
  /** Normalized pathname ("/", "/services"). */
  path: string;
  kind: "title" | "meta_description";
  value: string;
  createdAt: string;
};

export type EdgeRuleSet = {
  /** Soft kill: true = serve origin untouched for the whole host. */
  kill: boolean;
  rules: EdgeRule[];
};

export const EMPTY_RULESET: EdgeRuleSet = { kill: false, rules: [] };

export function rulesKvKey(host: string): string {
  return `custom:edge_rules:${host.toLowerCase()}`;
}

export function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed.toLowerCase();
}

export function rulesForPath(set: EdgeRuleSet, pathname: string): EdgeRule[] {
  if (set.kill) return [];
  const path = normalizePath(pathname);
  return set.rules.filter((rule) => rule.path === path);
}

/** One rule per (path, kind); the newest wins, and a re-applied move replaces
 *  its older rule instead of stacking. */
export function mergeRules(
  existing: EdgeRuleSet,
  additions: EdgeRule[],
): EdgeRuleSet {
  const byKey = new Map<string, EdgeRule>();
  for (const rule of [...existing.rules, ...additions]) {
    byKey.set(`${rule.path}|${rule.kind}`, rule);
  }
  return { kill: existing.kill, rules: [...byKey.values()] };
}

export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

/** Pull the applied values out of a Move's paste-ready snippet, so the edge
 *  applies exactly what the owner would have pasted. */
export function rulesFromSnippet(input: {
  moveId: string;
  targetUrl: string;
  snippet: string;
  now: string;
}): EdgeRule[] {
  let path: string;
  try {
    path = normalizePath(new URL(input.targetUrl).pathname);
  } catch {
    return [];
  }
  const rules: EdgeRule[] = [];

  const title = /<title>([\s\S]*?)<\/title>/i.exec(input.snippet);
  if (title && title[1].trim()) {
    rules.push({
      id: crypto.randomUUID(),
      moveId: input.moveId,
      path,
      kind: "title",
      value: title[1]
        .trim()
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
      createdAt: input.now,
    });
  }

  const meta = /<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/?>/i.exec(
    input.snippet,
  );
  if (meta && meta[1].trim()) {
    rules.push({
      id: crypto.randomUUID(),
      moveId: input.moveId,
      path,
      kind: "meta_description",
      value: meta[1]
        .trim()
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
      createdAt: input.now,
    });
  }

  return rules;
}
