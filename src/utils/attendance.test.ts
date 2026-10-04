import { describe, expect, it } from 'vitest';
import type { AttendanceDay } from '../types';
import { newestFirst, summarizeAttendance } from './attendance';

const day = (date: string, going: 'in' | 'out', returning: 'in' | 'out') =>
  ({ id: date, date, goingStatus: going, returningStatus: returning }) as AttendanceDay;

const days = [day('2026-10-01', 'in', 'in'), day('2026-10-03', 'out', 'in'), day('2026-10-02', 'in', 'out')];

describe('summarizeAttendance', () => {
  it('counts IN days per direction and reports the period', () => {
    expect(summarizeAttendance(days)).toEqual({
      days: 3,
      goingIn: 2,
      returningIn: 2,
      from: '2026-10-01',
      to: '2026-10-03',
    });
  });

  it('copes with no records', () => {
    expect(summarizeAttendance([])).toEqual({ days: 0, goingIn: 0, returningIn: 0, from: null, to: null });
  });
});

describe('newestFirst', () => {
  it('sorts by date descending without mutating the input', () => {
    const copy = [...days];
    expect(newestFirst(days).map((d) => d.date)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01']);
    expect(days).toEqual(copy);
  });
});
