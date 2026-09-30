import type { Timestamp } from 'firebase/firestore';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as yyyy-mm-dd. */
export function todayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTime(value: Timestamp | Date | null | undefined, locale = 'ar-EG'): string {
  if (!value) return '';
  const date = value instanceof Date ? value : value.toDate();
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDate(value: Timestamp | Date | string | null | undefined): string {
  if (!value) return '';
  const date =
    typeof value === 'string' ? new Date(`${value}T00:00:00`) : value instanceof Date ? value : value.toDate();
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** e.g. "الأربعاء، 30 سبتمبر". Latin digits, to match the rest of the UI (1 / 13). */
export function formatDayLabel(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  return date.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Exact clock time including seconds, e.g. "6:05:09 م". */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString('ar-EG-u-nu-latn', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/** "الآن" / "منذ 25 ثانية" / "منذ 3 دقيقة" for a duration in milliseconds. */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'الآن';
  if (s < 60) return `منذ ${s} ثانية`;
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${m} دقيقة`;
  return `منذ ${Math.floor(m / 60)} ساعة`;
}
