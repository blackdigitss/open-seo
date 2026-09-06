// Pure gap logic, kept out of the job so it's testable without the client.
export type RankedRow = {
  keyword: string;
  position: number | null;
  volume: number | null;
};

type KeywordGap = {
  keyword: string;
  volume: number;
  competitor: string;
  competitorPosition: number;
};

/** Keywords a competitor ranks top-20 for that we don't rank for at all. */
export function diffGaps(input: {
  ours: RankedRow[];
  competitor: string;
  theirs: RankedRow[];
  limit?: number;
}): KeywordGap[] {
  const ourKeywords = new Set(
    input.ours.map((row) => row.keyword.toLowerCase().trim()),
  );
  const gaps: KeywordGap[] = [];
  for (const row of input.theirs) {
    const keyword = row.keyword.toLowerCase().trim();
    if (!keyword || ourKeywords.has(keyword)) continue;
    if (row.position === null || row.position > 20) continue;
    gaps.push({
      keyword,
      volume: row.volume ?? 0,
      competitor: input.competitor,
      competitorPosition: row.position,
    });
  }
  gaps.sort((a, b) => b.volume - a.volume);
  return gaps.slice(0, input.limit ?? 10);
}

/** The best gap per keyword across all competitors, by volume. */
export function mergeGaps(all: KeywordGap[], limit = 10): KeywordGap[] {
  const best = new Map<string, KeywordGap>();
  for (const gap of all) {
    const existing = best.get(gap.keyword);
    if (!existing || gap.volume > existing.volume) best.set(gap.keyword, gap);
  }
  const merged = [...best.values()];
  merged.sort((a, b) => b.volume - a.volume);
  return merged.slice(0, limit);
}
