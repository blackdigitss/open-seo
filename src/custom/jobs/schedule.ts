// Small helpers that turn "when should this run" into a period key for the
// ledger. All times UTC. The owner is in New York (UTC-4/-5), so 08:00 UTC is
// the small hours there, and 11:30 UTC is a 7:30 breakfast in summer.
import { dayKey, isoWeekKey, isoWeekday, monthKey } from "@/custom/lib/time";

export const dailyAfter =
  (hourUtc: number, minute = 0) =>
  (now: Date) =>
    now.getUTCHours() > hourUtc ||
    (now.getUTCHours() === hourUtc && now.getUTCMinutes() >= minute)
      ? dayKey(now)
      : null;

export const weeklyOn =
  (weekday: number, hourUtc: number, minute = 0) =>
  (now: Date) =>
    isoWeekday(now) === weekday && dailyAfter(hourUtc, minute)(now)
      ? isoWeekKey(now)
      : null;

export const monthlyOn =
  (dayOfMonth: number, hourUtc: number) => (now: Date) =>
    now.getUTCDate() >= dayOfMonth && dailyAfter(hourUtc)(now)
      ? monthKey(now)
      : null;

/** Every tick; the period is the tick itself. */
export const everyTick = (now: Date) => now.toISOString().slice(0, 16);
