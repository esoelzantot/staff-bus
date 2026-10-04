import { describe, expect, it } from 'vitest';
import type { AttendanceDay } from '../types';
import { availableMonths, buildMonth, monthOf } from './attendance';

const day = (date: string, going: 'in' | 'out', returning: 'in' | 'out') =>
  ({ id: date, date, goingStatus: going, returningStatus: returning }) as AttendanceDay;

describe('monthOf / availableMonths', () => {
  it('cuts the month out of a day key', () => {
    expect(monthOf('2026-10-04')).toBe('2026-10');
  });

  it('offers every month with a record plus the current one, newest first, without duplicates', () => {
    const days = [day('2026-08-30', 'in', 'in'), day('2026-10-01', 'in', 'in'), day('2026-10-02', 'in', 'in')];
    expect(availableMonths(days, '2026-10')).toEqual(['2026-10', '2026-08']);
    expect(availableMonths([], '2026-10')).toEqual(['2026-10']);
    expect(availableMonths(days, '2026-11')).toEqual(['2026-11', '2026-10', '2026-08']);
  });
});

describe('buildMonth', () => {
  const october = [
    day('2026-10-01', 'in', 'in'),
    day('2026-10-02', 'in', 'out'),
    day('2026-10-04', 'out', 'in'),
    day('2026-09-30', 'in', 'in'), // another month: ignored
  ];

  it('has a row for every day of a finished month, in calendar order', () => {
    const view = buildMonth(october, '2026-10', '2026-12-01');
    expect(view.rows).toHaveLength(31);
    expect(view.rows[0].date).toBe('2026-10-01');
    expect(view.rows[30].date).toBe('2026-10-31');
  });

  it('counts the IN days per direction and the recorded days', () => {
    const view = buildMonth(october, '2026-10', '2026-12-01');
    expect(view).toMatchObject({ recorded: 3, goingIn: 2, returningIn: 2 });
  });

  it('shows days without a record as null (not as OUT) and does not count them', () => {
    const view = buildMonth(october, '2026-10', '2026-12-01');
    expect(view.rows[2]).toEqual({ date: '2026-10-03', goingStatus: null, returningStatus: null });
    expect(view.rows[3]).toEqual({ date: '2026-10-04', goingStatus: 'out', returningStatus: 'in' });
  });

  it('stops at today for the running month – never lists a future day', () => {
    const view = buildMonth(october, '2026-10', '2026-10-04');
    expect(view.rows.map((r) => r.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('knows month lengths (February, leap year)', () => {
    expect(buildMonth([], '2026-02', '2026-12-01').rows).toHaveLength(28);
    expect(buildMonth([], '2028-02', '2028-12-01').rows).toHaveLength(29);
    expect(buildMonth([], '2026-04', '2026-12-01').rows).toHaveLength(30);
  });

  it('is empty for a month that has not started', () => {
    expect(buildMonth([], '2026-11', '2026-10-04').rows).toEqual([]);
  });
});
