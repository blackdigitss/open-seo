const DAY_MS = 24 * 60 * 60 * 1000;

export function isoNow(): string {
  return new Date().toISOString();
}

/** YYYY-MM-DD in UTC. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftDays(day: string, delta: number): string {
  return dayKey(new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS));
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) /
      DAY_MS,
  );
}

/** YYYY-MM in UTC. */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** ISO-8601 week, e.g. 2026-W36. */
export function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: Date): number {
  return date.getUTCDay() || 7;
}

/** The same-length window immediately before [start, end]. */
export function previousWindow(start: string, end: string) {
  const length = daysBetween(start, end);
  const prevEnd = shiftDays(start, -1);
  return { start: shiftDays(prevEnd, -length), end: prevEnd };
}

/** The same window one year earlier. */
export function lastYearWindow(start: string, end: string) {
  return { start: shiftDays(start, -364), end: shiftDays(end, -364) };
}
