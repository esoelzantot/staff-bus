import { describe, expect, it } from 'vitest';
import { buildArrivalMonth, cairoMinutes, formatMinutes, isLate, shiftMonth, type ArrivalRecord } from './arrivals';

// November 2026: Cairo is UTC+2 (winter time since the end of October). Nov 1 = Sunday.
const at = (day: string, cairo: string) => new Date(`${day}T${cairo}:00+02:00`);
const rec = (date: string, time: string | null, by = 'Eslam'): ArrivalRecord => ({
  date,
  arrivalTime: time ? at(date, time) : null,
  arrivedByName: time ? by : null,
});

describe('cairoMinutes / formatMinutes', () => {
  it('reads the clock in Cairo, whatever the device time zone', () => {
    expect(cairoMinutes(at('2026-11-02', '07:42'))).toBe(462);
    expect(cairoMinutes(new Date('2026-07-01T04:30:00Z'))).toBe(7 * 60 + 30); // summer: UTC+3
  });

  it('12-hour Arabic clock with Latin digits', () => {
    expect(formatMinutes(462)).toBe('7:42 ص');
    expect(formatMinutes(905)).toBe('3:05 م');
    expect(formatMinutes(0)).toBe('12:00 ص');
    expect(formatMinutes(720)).toBe('12:00 م');
  });
});

describe('buildArrivalMonth', () => {
  const records = [rec('2026-11-01', '07:40'), rec('2026-11-02', '07:50', 'Sara'), rec('2026-11-04', null)];

  it('a row for every working day up to today, newest first', () => {
    const m = buildArrivalMonth(records, '2026-11', '2026-11-08');
    // Nov 1–5 = Sun–Thu, 6–7 = Fri/Sat (skipped), 8 = Sunday
    expect(m.rows.map((r) => r.date)).toEqual([
      '2026-11-08',
      '2026-11-05',
      '2026-11-04',
      '2026-11-03',
      '2026-11-02',
      '2026-11-01',
    ]);
  });

  it('time and who recorded it; days without an arrival stay empty', () => {
    const m = buildArrivalMonth(records, '2026-11', '2026-11-04');
    expect(m.rows.find((r) => r.date === '2026-11-02')).toMatchObject({ minutes: 470, arrivedByName: 'Sara' });
    expect(m.rows.find((r) => r.date === '2026-11-04')).toMatchObject({ minutes: null, arrivedByName: null });
  });

  it('a Friday / Saturday shows up only when the bus did arrive', () => {
    const m = buildArrivalMonth([rec('2026-11-06', '09:00')], '2026-11', '2026-11-07');
    expect(m.rows.map((r) => r.date)).toContain('2026-11-06');
    expect(m.rows.map((r) => r.date)).not.toContain('2026-11-07');
  });

  it('average, earliest and latest arrival', () => {
    const m = buildArrivalMonth(records, '2026-11', '2026-11-04');
    expect(m).toMatchObject({ recorded: 2, average: 465, earliest: 460, latest: 470 });
  });

  it('no arrivals: no numbers', () => {
    expect(buildArrivalMonth([], '2026-11', '2026-11-02')).toMatchObject({ recorded: 0, average: null });
  });

  it('never a future day, and only the asked month', () => {
    const m = buildArrivalMonth([rec('2026-10-29', '07:30')], '2026-11', '2026-11-02');
    expect(m.rows.map((r) => r.date)).toEqual(['2026-11-02', '2026-11-01']);
  });
});

describe('بدري / متأخر (on time until 9:00)', () => {
  it('9:00 is still on time, 9:01 is late', () => {
    expect(isLate(8 * 60 + 59)).toBe(false);
    expect(isLate(9 * 60)).toBe(false);
    expect(isLate(9 * 60 + 1)).toBe(true);
  });

  it('the month counts on-time and late days', () => {
    const m = buildArrivalMonth(
      [rec('2026-11-01', '07:40'), rec('2026-11-02', '09:00'), rec('2026-11-03', '09:20'), rec('2026-11-04', null)],
      '2026-11',
      '2026-11-04',
    );
    expect(m).toMatchObject({ recorded: 3, onTime: 2, late: 1 });
  });
});

describe('shiftMonth', () => {
  it('moves across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
