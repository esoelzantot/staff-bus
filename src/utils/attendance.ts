import type { AttendanceDay } from '../types';

export interface AttendanceSummary {
  /** Number of recorded days. */
  days: number;
  goingIn: number;
  returningIn: number;
  /** yyyy-mm-dd of the oldest / newest record, or null when there is none. */
  from: string | null;
  to: string | null;
}

/** Totals of a daily IN record (the same numbers the PDF prints above its table). */
export function summarizeAttendance(days: readonly AttendanceDay[]): AttendanceSummary {
  const dates = days.map((d) => d.date).sort();
  return {
    days: days.length,
    goingIn: days.filter((d) => d.goingStatus === 'in').length,
    returningIn: days.filter((d) => d.returningStatus === 'in').length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

/** Newest day first, without touching the input. */
export const newestFirst = (days: readonly AttendanceDay[]): AttendanceDay[] =>
  [...days].sort((a, b) => b.date.localeCompare(a.date));
