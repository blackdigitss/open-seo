/** Reads JSON we wrote ourselves (a Move's evidence, a verdict, a job summary).
 *  The shape is ours by construction, so the cast is deliberate; `fallback`
 *  covers the row written by an older version. Never use this on third-party
 *  input — validate that with Zod. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- our own serialized shape; fallback covers drift
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
