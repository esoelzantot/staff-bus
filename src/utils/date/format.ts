import type { Timestamp } from 'firebase/firestore';

/**
 * The service runs in Cairo: the trip "day", the nightly reset and every time shown to employees use Cairo
 * time, whatever the clock / time zone of the phone says. (Keep in sync with scripts/lib/cairoTime.ts.)
 */
export const APP_TIME_ZONE = 'Africa/Cairo';

/** Calendar day (yyyy-mm-dd) in Cairo. */
export function todayKey(date: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

type TimeInput = Timestamp | Date;
const toDate = (value: TimeInput) => (value instanceof Date ? value : value.toDate());

/**
 * A yyyy-mm-dd key is a calendar day, not a moment: pin it to noon UTC and format it in UTC so it can never
 * slip to the neighbouring day because of the viewer's time zone.
 */
function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatTime(value: TimeInput | null | undefined, locale = 'ar-EG'): string {
  if (!value) return '';
  return toDate(value).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: APP_TIME_ZONE,
  });
}

export function formatDate(value: TimeInput | string | null | undefined): string {
  if (!value) return '';
  const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  return typeof value === 'string'
    ? dayKeyToDate(value).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' })
    : toDate(value).toLocaleDateString('en-GB', { ...options, timeZone: APP_TIME_ZONE });
}

/** e.g. "الأربعاء، 30 سبتمبر". Latin digits, to match the rest of the UI (1 / 13). */
export function formatDayLabel(value: Date | string = new Date()): string {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  return typeof value === 'string'
    ? dayKeyToDate(value).toLocaleDateString('ar-EG-u-nu-latn', { ...options, timeZone: 'UTC' })
    : value.toLocaleDateString('ar-EG-u-nu-latn', { ...options, timeZone: APP_TIME_ZONE });
}

/** Exact clock time including seconds, e.g. "6:05:09 م". */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString('ar-EG-u-nu-latn', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: APP_TIME_ZONE,
  });
}

/** Arabic count phrase: 1 → "دقيقة", 2 → "دقيقتان/دقيقتين", 3–10 → "N دقائق", 11+ → "N دقيقة". */
function countPhrase(n: number, forms: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  return `${n} ${n >= 3 && n <= 10 ? forms.few : forms.many}`;
}

const SECONDS = { one: 'ثانية', two: 'ثانيتين', few: 'ثوانٍ', many: 'ثانية' };
const MINUTES = { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' };
const HOURS = { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' };

/** "الآن" / "منذ 25 ثانية" / "منذ 3 دقائق" / "منذ ساعتين" for a duration in milliseconds. */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'الآن';
  if (s < 60) return `منذ ${countPhrase(s, SECONDS)}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${countPhrase(m, MINUTES)}`;
  return `منذ ${countPhrase(Math.floor(m / 60), HOURS)}`;
}
