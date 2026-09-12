// A page, not a card, is what the owner actually edits. Producers each look at
// one signal, so the same URL can pick up an audit fix, a decay refresh and an
// opening on the same night — three cards, one editing session, and in the
// worst case two of them rewriting the same <title> with different text.
//
// This is the shared vocabulary for that: which part of a page a Move writes,
// which of those can only have one writer, and the order the work makes sense
// in. Pure and client-safe — the nightly reconcile pass and the moves list both
// read from here so the app never orders them two different ways.
import { sort } from "remeda";
import { parseJson } from "@/custom/lib/json";
import type { MoveRow } from "./types";

/** The part of the page a Move changes. */
type PageSurface =
  | "http"
  | "canonical"
  | "robots"
  | "title"
  | "meta_description"
  | "jsonld"
  | "body"
  | "images"
  | "offsite";

/** Surfaces where the page can only hold one answer. Two open Moves writing the
 *  same one are a contradiction: applying both is impossible, and whichever
 *  lands second makes the first fail verification. */
const EXCLUSIVE: ReadonlySet<PageSurface> = new Set<PageSurface>([
  "http",
  "canonical",
  "robots",
  "title",
  "meta_description",
]);

export function isExclusive(surface: PageSurface): boolean {
  return EXCLUSIVE.has(surface);
}

// Indexability before substance before the tags that describe it: there is no
// point rewriting the title of a page that 404s, and no point describing a page
// before its content is refreshed.
const SURFACE_RANK: Record<PageSurface, number> = {
  http: 0,
  robots: 0,
  canonical: 1,
  body: 2,
  jsonld: 3,
  title: 4,
  meta_description: 5,
  images: 6,
  offsite: 7,
};

const ISSUE_SURFACES: Array<[RegExp, PageSurface]> = [
  [/broken|404|status|redirect/i, "http"],
  [/noindex|robots/i, "robots"],
  [/canonical/i, "canonical"],
  [/meta-description|meta_description/i, "meta_description"],
  [/title/i, "title"],
  [/schema|json-?ld|structured/i, "jsonld"],
  [/alt|image/i, "images"],
  [/content|word-count|heading|h1/i, "body"],
];

/** Every surface a Move touches. Read from what it actually ships — the snippet
 *  the owner pastes and the expectation the verification crawl checks — so a
 *  Move that rewrites both the title and the description is counted as both. */
export function surfacesOf(move: MoveRow): PageSurface[] {
  const found = new Set<PageSurface>();

  if (move.snippet) {
    if (/<title\b/i.test(move.snippet)) found.add("title");
    if (/name=["']description["']/i.test(move.snippet))
      found.add("meta_description");
    if (/rel=["']canonical["']/i.test(move.snippet)) found.add("canonical");
    if (/application\/ld\+json/i.test(move.snippet)) found.add("jsonld");
  }

  const evidence = parseJson<Record<string, unknown>>(move.evidenceJson, {});
  const verify = evidence.verify;
  const verifyKind =
    verify && typeof verify === "object" && "kind" in verify
      ? String((verify as { kind: unknown }).kind)
      : null;
  switch (verifyKind) {
    case "title":
      found.add("title");
      break;
    case "meta_description":
      found.add("meta_description");
      break;
    case "canonical":
      found.add("canonical");
      break;
    case "jsonld":
      found.add("jsonld");
      break;
    case "images_alt":
      found.add("images");
      break;
    case "status":
      found.add("http");
      break;
    case "text_present":
      found.add("body");
      break;
  }

  const issueType = evidence.issueType;
  if (typeof issueType === "string") {
    const match = ISSUE_SURFACES.find(([pattern]) => pattern.test(issueType));
    if (match) found.add(match[1]);
  }

  if (found.size === 0) {
    // A refresh rewrites the page itself; anything else we can't place is
    // off-page work (reviews, citations) that clashes with nothing.
    found.add(move.source === "decay" ? "body" : "offsite");
  }
  return [...found];
}

/** The surface that decides where a Move sits in the page's running order. */
function leadSurface(move: MoveRow): PageSurface {
  const surfaces = surfacesOf(move);
  return surfaces.reduce((best, surface) =>
    SURFACE_RANK[surface] < SURFACE_RANK[best] ? surface : best,
  );
}

/** Trailing slashes and case make one page look like two. Mirrors
 *  `producers/types.ts` so the client can group without importing server code. */
export function pageKey(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin.toLowerCase()}${path}`;
  } catch {
    return url.replace(/\/+$/, "").toLowerCase();
  }
}

/** The order to work a single page in: indexability, then substance, then the
 *  tags. Score breaks ties so the bigger win leads within a tier. */
export function sequencePage<T extends MoveRow>(moves: readonly T[]): T[] {
  return sort(moves, (a, b) => {
    const bySurface =
      SURFACE_RANK[leadSurface(a)] - SURFACE_RANK[leadSurface(b)];
    if (bySurface !== 0) return bySurface;
    if (b.score !== a.score) return b.score - a.score;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

type PageGroup<T extends MoveRow> = {
  key: string;
  /** The URL as the first Move spells it, for display and linking. */
  url: string;
  moves: T[];
};

/** Moves bundled by the page they edit, each bundle in working order, bundles
 *  ordered by their best Move. Moves with no page (setup, off-site work) come
 *  back in a group keyed "" so callers can render them flat. */
export function groupByPage<T extends MoveRow>(
  moves: readonly T[],
): PageGroup<T>[] {
  const groups = new Map<string, PageGroup<T>>();
  for (const move of moves) {
    const key = pageKey(move.targetUrl);
    const group = groups.get(key);
    if (group) {
      group.moves.push(move);
      continue;
    }
    groups.set(key, { key, url: move.targetUrl ?? "", moves: [move] });
  }

  const ordered = [...groups.values()].map((group) => ({
    ...group,
    moves: group.key === "" ? group.moves : sequencePage(group.moves),
  }));

  return sort(ordered, (a, b) => {
    const bestA = Math.max(...a.moves.map((move) => move.score));
    const bestB = Math.max(...b.moves.map((move) => move.score));
    return bestB - bestA;
  });
}
