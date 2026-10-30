// Asia/Manila is UTC+8 all year (no daylight saving), so fixed-offset math is exact.
export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) in Manila for an instant. */
export function manilaDate(instant: Date): string {
  return new Date(instant.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hour of day (0-23) in Manila for an instant. */
export function manilaHour(instant: Date): number {
  return new Date(instant.getTime() + MANILA_OFFSET_MS).getUTCHours();
}

/** The instant at hh:00 Manila time on a Manila calendar date. */
export function manilaInstant(date: string, hour: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + hour * 3600_000 - MANILA_OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}
