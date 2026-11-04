/** Calendar day (yyyy-mm-dd) and hour (0-23) in Cairo, DST-aware. */
export function cairoNow(now: Date = new Date()): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** The reset runs at 22:00 Cairo: from then on, IN / OUT belongs to the next working day. */
export const RESET_HOUR = 22;
/** A failed reset may still be retried through the night, until 05:59 – never during a working day. */
export const RESET_WINDOW_END_HOUR = 6;

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday … 5 = Friday, 6 = Saturday

/**
 * The working day that IN / OUT currently belongs to (yyyy-mm-dd):
 * today until 22:00, then the next day; Friday and Saturday are days off, so they belong to Sunday.
 * Uses the Cairo wall clock, so it is right on the nights the clocks change. Mirrored in firestore.rules
 * (serviceDay) and src/utils/date/format.ts (serviceDayKey); tests/unit/cairoDay.test.ts checks all three.
 */
export function serviceDay(now: Date = new Date()): string {
  const { date, hour } = cairoNow(now);
  const day = hour >= RESET_HOUR ? addDays(date, 1) : date;
  const weekday = weekdayOf(day);
  return weekday === 5 ? addDays(day, 2) : weekday === 6 ? addDays(day, 1) : day;
}

/**
 * May the automatic reset act now? From 22:00 on Sunday–Thursday, with retries until 05:59 the next morning
 * (Thursday's night ends on Friday morning; early Sunday only catches a Sunday that was never prepared).
 */
export function resetWindow(now: Date = new Date()): 'open' | 'outside-window' | 'day-off' {
  const { date, hour } = cairoNow(now);
  const weekday = weekdayOf(date);
  if (hour >= RESET_HOUR) return weekday === 5 || weekday === 6 ? 'day-off' : 'open';
  if (hour < RESET_WINDOW_END_HOUR) return weekday === 6 ? 'day-off' : 'open';
  return 'outside-window';
}
