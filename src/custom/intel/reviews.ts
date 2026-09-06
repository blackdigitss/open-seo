// Review-row parsing, kept pure for tests. DataForSEO's review items are loose
// records; we keep only what monitoring needs.
export type ParsedReview = {
  externalId: string;
  author: string | null;
  rating: number | null;
  text: string | null;
  publishedAt: string | null;
  ownerReplied: boolean;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function get(record: Record<string, unknown>, ...path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = Reflect.get(current, key);
  }
  return current;
}

export function parseReviewItem(
  item: Record<string, unknown>,
): ParsedReview | null {
  const author = str(get(item, "profile_name"));
  const text = str(get(item, "review_text"));
  const publishedAt = str(get(item, "timestamp"));
  const externalId =
    str(get(item, "review_id")) ??
    // Extended-source reviews can miss review_id; a stable digest of who/when
    // keeps the upsert idempotent.
    (author || publishedAt || text
      ? `${author ?? ""}|${publishedAt ?? ""}|${(text ?? "").slice(0, 60)}`
      : null);
  if (!externalId) return null;
  return {
    externalId,
    author,
    rating: num(get(item, "rating", "value")),
    text,
    publishedAt,
    ownerReplied: get(item, "owner_answer") != null,
  };
}

export function reviewStats(reviews: ParsedReview[]): {
  count: number;
  averageRating: number | null;
  unanswered: number;
  bad: ParsedReview[];
} {
  const rated = reviews.filter((review) => review.rating !== null);
  const averageRating =
    rated.length > 0
      ? rated.reduce((sum, review) => sum + (review.rating ?? 0), 0) /
        rated.length
      : null;
  return {
    count: reviews.length,
    averageRating,
    unanswered: reviews.filter((review) => !review.ownerReplied).length,
    bad: reviews.filter(
      (review) => review.rating !== null && review.rating <= 3,
    ),
  };
}
