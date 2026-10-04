import { describe, expect, it } from 'vitest';
import type { AttendanceDay } from '../../types';
import { buildAttendancePdf } from './generateAttendancePdf';

const day = (date: string, going: 'in' | 'out', returning: 'in' | 'out') =>
  ({ id: date, date, goingStatus: going, returningStatus: returning }) as AttendanceDay;

// ASCII-only data: the PDF text stays real text (Arabic goes through a browser canvas and is previewed by hand).
const base = { employeeName: 'Ahmed Ali', employeeType: 'main' as const, route: 'Nozha', busNumber: 'A 8381' };
const textOf = (doc: ReturnType<typeof buildAttendancePdf>) =>
  (doc as unknown as { internal: { pages: string[][] } }).internal.pages.flat().join(' ');

const january = [
  day('2026-01-01', 'in', 'in'),
  day('2026-01-02', 'out', 'in'),
  day('2026-01-03', 'in', 'out'),
  day('2025-12-31', 'in', 'in'), // another month: not printed
];

describe('buildAttendancePdf (monthly record)', () => {
  it('prints the month, its totals and a row for EVERY day of the month', () => {
    const text = textOf(buildAttendancePdf({ ...base, month: '2026-01', days: january, today: '2026-02-10' }));
    expect(text).toContain('January 2026');
    expect(text).toContain('Ahmed Ali');
    expect(text).toContain('Days recorded: 3 of 31');
    expect(text).toContain('Going - IN: 2 days');
    expect(text).toContain('Returning - IN: 2 days');
    expect(text).toContain('31 Jan 2026'); // the last day is listed although nothing was recorded for it
    expect(text).not.toContain('31 Dec 2025'); // other months are left out
  });

  it('lists the days in calendar order', () => {
    const text = textOf(buildAttendancePdf({ ...base, month: '2026-01', days: january, today: '2026-02-10' }));
    expect(text.lastIndexOf('01 Jan 2026')).toBeLessThan(text.lastIndexOf('02 Jan 2026'));
    expect(text.lastIndexOf('02 Jan 2026')).toBeLessThan(text.lastIndexOf('31 Jan 2026'));
  });

  it('stops at today for the running month', () => {
    const text = textOf(buildAttendancePdf({ ...base, month: '2026-01', days: january, today: '2026-01-04' }));
    expect(text).toContain('Days recorded: 3 of 4');
    expect(text).toContain('04 Jan 2026');
    expect(text).not.toContain('05 Jan 2026');
  });

  it('never prints an Employee ID (it is the sign-in credential)', () => {
    const text = textOf(buildAttendancePdf({ ...base, month: '2026-01', days: january, today: '2026-02-10' }));
    expect(text).not.toMatch(/EMP\d+/i);
  });

  it('numbers the pages (a 31-day month needs two)', () => {
    const doc = buildAttendancePdf({ ...base, month: '2026-01', days: january, today: '2026-02-10' });
    expect(doc.getNumberOfPages()).toBe(2);
    expect(textOf(doc)).toContain('Page 2 of 2');
  });

  it('copes with a month without any record, and with a month that has not started', () => {
    expect(textOf(buildAttendancePdf({ ...base, month: '2026-03', days: january, today: '2026-04-01' }))).toContain(
      'Days recorded: 0 of 31',
    );
    expect(textOf(buildAttendancePdf({ ...base, month: '2026-05', days: january, today: '2026-04-01' }))).toContain(
      'No days in this month yet.',
    );
  });
});
