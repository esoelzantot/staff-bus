import { describe, expect, it } from 'vitest';
import type { AttendanceDay } from '../../types';
import { buildAttendancePdf } from './generateAttendancePdf';

// ASCII-only data: the PDF text stays real text (Arabic goes through a browser canvas and is previewed by hand).
const makeDays = (count: number): AttendanceDay[] =>
  Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return {
      id: date,
      date,
      goingStatus: i % 2 === 0 ? 'in' : 'out',
      returningStatus: 'in',
    } as AttendanceDay;
  });

const base = { employeeName: 'Ahmed Ali', employeeType: 'main' as const, route: 'Nozha', busNumber: 'A 8381' };

describe('buildAttendancePdf', () => {
  it('prints the totals and the days, newest first', () => {
    const doc = buildAttendancePdf({ ...base, days: makeDays(3) });
    expect(doc.getNumberOfPages()).toBe(1);
    const text = (doc as unknown as { internal: { pages: string[][] } }).internal.pages.flat().join(' ');
    expect(text).toContain('Days recorded: 3');
    expect(text).toContain('Going - days IN: 2 of 3');
    expect(text).toContain('Returning - days IN: 3 of 3');
    expect(text).toContain('Ahmed Ali');
    // the header's "Period" line also mentions both dates (oldest first), so compare the LAST occurrences = the table rows
    expect(text.lastIndexOf('03 Jan 2026')).toBeLessThan(text.lastIndexOf('01 Jan 2026'));
  });

  it('never prints an Employee ID (it is the sign-in credential)', () => {
    const doc = buildAttendancePdf({ ...base, days: makeDays(2) });
    const text = (doc as unknown as { internal: { pages: string[][] } }).internal.pages.flat().join(' ');
    expect(text).not.toMatch(/EMP\d+/i);
  });

  it('paginates a long history and numbers the pages', () => {
    const doc = buildAttendancePdf({ ...base, days: makeDays(400) });
    expect(doc.getNumberOfPages()).toBeGreaterThan(8);
  });

  it('copes with an empty record', () => {
    expect(buildAttendancePdf({ ...base, days: [] }).getNumberOfPages()).toBe(1);
  });
});
