import { APP_TIME_ZONE } from './date/format';

/** One recorded going trip of a bus (busTrips/{busId}_{date}_going). */
export interface ArrivalRecord {
  /** yyyy-mm-dd (Cairo) */
  date: string;
  arrivalTime: Date | null;
  arrivedByName: string | null;
}

export interface ArrivalRow {
  date: string;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** Minutes after midnight, Cairo time – null when no arrival was recorded that day. */
  minutes: number | null;
  arrivedByName: string | null;
}

export interface ArrivalMonth {
  rows: ArrivalRow[];
  /** Days with an arrival. */
  recorded: number;
  /** Of those: arrived by 9:00 / after 9:00. */
  onTime: number;
  late: number;
  /** Average / earliest / latest arrival in minutes after midnight (Cairo), null without arrivals. */
  average: number | null;
  earliest: number | null;
  latest: number | null;
}

/** The bus is on time ("بدري") up to 9:00 in the morning, Cairo time; any later arrival is late ("متأخر"). */
export const ON_TIME_UNTIL = 9 * 60;

/** 9:00 itself is still on time. */
export const isLate = (minutes: number) => minutes > ON_TIME_UNTIL;

/** Sunday … Thursday: the bus runs on working days. */
const WORKING_DAYS = new Set([0, 1, 2, 3, 4]);

const cairoClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Minutes after midnight of a moment, in Cairo. */
export function cairoMinutes(time: Date): number {
  const parts = Object.fromEntries(cairoClock.formatToParts(time).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** 462 → "7:42 ص", 905 → "3:05 م" (Latin digits, like the rest of the app). */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
}

const weekdayOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
};

/**
 * A month of arrivals: one row for every working day up to today (and for any other day that has an arrival),
 * newest first, plus the month's average / earliest / latest arrival time.
 */
export function buildArrivalMonth(records: readonly ArrivalRecord[], month: string, today: string): ArrivalMonth {
  const [year, number] = month.split('-').map(Number);
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const byDate = new Map(records.filter((r) => r.date.startsWith(month)).map((r) => [r.date, r]));

  const rows: ArrivalRow[] = [];
  for (let n = 1; n <= length; n++) {
    const date = `${month}-${String(n).padStart(2, '0')}`;
    if (date > today) break;
    const record = byDate.get(date);
    const weekday = weekdayOf(date);
    if (!record?.arrivalTime && !WORKING_DAYS.has(weekday)) continue; // Friday / Saturday without an arrival
    rows.push({
      date,
      weekday,
      minutes: record?.arrivalTime ? cairoMinutes(record.arrivalTime) : null,
      arrivedByName: record?.arrivalTime ? record.arrivedByName : null,
    });
  }
  rows.reverse();

  const times = rows.map((r) => r.minutes).filter((m): m is number => m !== null);
  return {
    rows,
    recorded: times.length,
    onTime: times.filter((m) => !isLate(m)).length,
    late: times.filter(isLate).length,
    average: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    earliest: times.length ? Math.min(...times) : null,
    latest: times.length ? Math.max(...times) : null,
  };
}

/** "2026-11" → "2026-10" / "2026-12". */
export function shiftMonth(month: string, step: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + step, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
