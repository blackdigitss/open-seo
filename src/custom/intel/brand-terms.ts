// Leaf module (no db/worker imports) so it's testable directly.

/** The brand name plus the obvious ways people type it. */
export function brandTerms(name: string, domain: string | null): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/\b(llc|inc|co|corp)\.?$/i, "")
    .trim();
  const terms = new Set<string>([cleaned]);
  terms.add(
    cleaned
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (domain) {
    const host = domain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(".")[0];
    if (host && host.length > 2) terms.add(host.replace(/-/g, " "));
  }
  return [...terms].filter((term) => term.length > 1).slice(0, 4);
}
