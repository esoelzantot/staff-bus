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

/** The automatic run only acts between 00:00 and 05:59 Cairo time, so it can never reset a day in progress. */
export const RESET_WINDOW_END_HOUR = 6;
