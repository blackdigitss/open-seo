// Approximate organic click-through rate by position. Only the shape matters:
// it turns "position 7 → 3" into an upside-clicks estimate for ranking moves,
// never into a figure shown to the owner as fact.
const CTR_BY_POSITION = [
  0, 0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.033, 0.028, 0.024, 0.02, 0.016, 0.014,
  0.012, 0.011, 0.01, 0.009, 0.008, 0.008, 0.007, 0.007,
] as const;

function ctrAtPosition(position: number): number {
  if (!Number.isFinite(position) || position < 1) return CTR_BY_POSITION[1];
  const index = Math.round(position);
  return CTR_BY_POSITION[index] ?? 0.005;
}

/** Extra monthly clicks if the query moved from `from` to `to`. */
export function upsideClicks(
  impressions: number,
  from: number,
  to = 3,
): number {
  const gain = ctrAtPosition(to) - ctrAtPosition(from);
  return Math.max(0, Math.round(impressions * gain));
}
