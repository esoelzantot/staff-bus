import type { AttendanceDay, EmployeeStatus } from '../types';

/** "2026-10-04" → "2026-10". */
export const monthOf = (day: string): string => day.slice(0, 7);

/** The months to offer in the export dialog: every month that has a record, plus `current`, newest first. */
export function availableMonths(days: readonly AttendanceDay[], current: string): string[] {
  return [...new Set([current, ...days.map((d) => monthOf(d.date))])].sort().reverse();
}

export interface MonthRow {
  /** yyyy-mm-dd */
  date: string;
  /** null = nothing was recorded for that day (e.g. before the daily record existed). */
  goingStatus: EmployeeStatus | null;
  returningStatus: EmployeeStatus | null;
}

export interface MonthView {
  /** yyyy-mm */
  month: string;
  /** Every calendar day of the month – up to today for the running month, never a future day. */
  rows: MonthRow[];
  /** Days that have a record. */
  recorded: number;
  /** Days IN for Going / Returning (each day counts once). */
  goingIn: number;
  returningIn: number;
}

/** One calendar month of an employee's record: a row for EVERY day, with its IN / OUT (or null) and the totals. */
export function buildMonth(days: readonly AttendanceDay[], month: string, today: string): MonthView {
  const [year, number] = month.split('-').map(Number);
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const byDate = new Map(days.map((d) => [d.date, d]));

  const rows: MonthRow[] = [];
  for (let n = 1; n <= length; n++) {
    const date = `${month}-${String(n).padStart(2, '0')}`;
    if (date > today) break;
    const record = byDate.get(date);
    rows.push({ date, goingStatus: record?.goingStatus ?? null, returningStatus: record?.returningStatus ?? null });
  }

  return {
    month,
    rows,
    recorded: rows.filter((r) => r.goingStatus !== null).length,
    goingIn: rows.filter((r) => r.goingStatus === 'in').length,
    returningIn: rows.filter((r) => r.returningStatus === 'in').length,
  };
}
