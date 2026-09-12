import { sort } from "remeda";

// Ten searches, one page, one job. GSC returns a row per query, so a single
// page surfaces as a dozen near-identical openings — "mobile notary", "mobile
// notary near me", "mobile notary services". Those are one editing session and
// one <title>, not a dozen competing ones. This groups queries by what they
// actually ask for, so a Move targets an intent instead of a string.

// Stripped before matching. "near me" and "best" carry intent the copy should
// still honour, so they stay in the query the owner reads — they just don't
// make two searches into two different jobs.
const NOISE = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "of",
  "to",
  "in",
  "on",
  "at",
  "my",
  "me",
  "you",
  "your",
  "i",
  "is",
  "are",
  "near",
  "nearby",
  "local",
  "best",
  "top",
  "good",
  "cheap",
  "cheapest",
  "affordable",
  "service",
  "company",
  "companies",
  "business",
  "provider",
  "providers",
]);

/** Singular form, for the cases English makes cheap. Anything cleverer needs a
 *  stemmer we don't want to ship to the worker. */
function singularize(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (
    word.length > 3 &&
    word.endsWith("s") &&
    !/(ss|us|is)$/.test(word) &&
    !word.endsWith("ss")
  ) {
    return word.slice(0, -1);
  }
  return word;
}

/** The content-bearing words of a search, as a set. */
function queryTokens(query: string): Set<string> {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize)
    .filter((token) => !NOISE.has(token));
  // An all-noise query ("near me") still has to cluster with something, so fall
  // back to its raw words rather than an empty set that matches everything.
  if (tokens.length === 0) {
    return new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean),
    );
  }
  return new Set(tokens);
}

/** Jaccard overlap, with containment counted as a full match: "notary" inside
 *  "mobile notary" is the same job asked two ways, even though Jaccard alone
 *  would score it 0.5. */
function querySimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  if (shared === a.size || shared === b.size) return 1;
  return shared / (a.size + b.size - shared);
}

// Above this, two searches want the same page saying the same thing. Below it,
// they are different intents — and a page ranking for both is a page trying to
// be two pages.
const SAME_INTENT = 0.5;

type QueryCluster<T> = {
  /** The member the page should be optimized for: the one with the most to gain. */
  primary: T;
  /** Primary first, then the rest by weight. */
  members: T[];
  /** Summed weight of every member. */
  weight: number;
};

/** Greedy single-pass clustering, heaviest query first, so the primary of each
 *  cluster is deterministic and is the query worth the title. */
export function clusterQueries<T>(
  items: readonly T[],
  queryOf: (item: T) => string,
  weightOf: (item: T) => number,
): QueryCluster<T>[] {
  const ranked = sort(items, (a, b) => weightOf(b) - weightOf(a));
  const clusters: Array<{ tokens: Set<string>; members: T[]; weight: number }> =
    [];

  for (const item of ranked) {
    const tokens = queryTokens(queryOf(item));
    const home = clusters.find(
      (cluster) => querySimilarity(cluster.tokens, tokens) >= SAME_INTENT,
    );
    if (home) {
      home.members.push(item);
      home.weight += weightOf(item);
      continue;
    }
    clusters.push({ tokens, members: [item], weight: weightOf(item) });
  }

  return clusters.map((cluster) => ({
    primary: cluster.members[0],
    members: cluster.members,
    weight: cluster.weight,
  }));
}
