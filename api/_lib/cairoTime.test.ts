import { describe, expect, it } from 'vitest';
import { cairoNow, resetWindow, serviceDay } from './cairoTime.js';

describe('cairoNow', () => {
  it('uses UTC+3 in summer and UTC+2 in winter', () => {
    expect(cairoNow(new Date('2026-07-01T21:10:00Z'))).toEqual({ date: '2026-07-02', hour: 0 });
    expect(cairoNow(new Date('2026-12-01T22:10:00Z'))).toEqual({ date: '2026-12-02', hour: 0 });
  });

  it('reports 23:xx as still the previous day', () => {
    expect(cairoNow(new Date('2026-12-01T21:10:00Z'))).toEqual({ date: '2026-12-01', hour: 23 });
  });
});

// November 2026, Cairo = UTC+2: Sun 8, Mon 9, Thu 12, Fri 13, Sat 14, Sun 15.
const at = (day: string, time: string) => new Date(`${day}T${time}:00+02:00`);

describe('serviceDay (the working day IN / OUT belongs to)', () => {
  it('is today until 21:59, the next day from 22:00', () => {
    expect(serviceDay(at('2026-11-09', '21:59'))).toBe('2026-11-09');
    expect(serviceDay(at('2026-11-09', '22:00'))).toBe('2026-11-10');
  });

  it('Thursday night, Friday and Saturday all belong to Sunday', () => {
    expect(serviceDay(at('2026-11-12', '21:59'))).toBe('2026-11-12');
    for (const [day, time] of [['2026-11-12', '22:00'], ['2026-11-13', '10:00'], ['2026-11-14', '23:00'], ['2026-11-15', '08:00']]) {
      expect(serviceDay(at(day, time))).toBe('2026-11-15');
    }
  });

  it('crosses the end of a month', () => {
    expect(serviceDay(at('2026-11-30', '22:00'))).toBe('2026-12-01');
  });

  it('the night the clocks go back (Thu 29 Oct 2026) still moves on at 22:00', () => {
    expect(serviceDay(new Date('2026-10-29T19:00:00Z'))).toBe('2026-11-01'); // 22:00 summer time, Thursday
  });
});

describe('resetWindow', () => {
  it('opens at 22:00 on Sunday–Thursday', () => {
    expect(resetWindow(at('2026-11-08', '22:00'))).toBe('open');
    expect(resetWindow(at('2026-11-12', '22:05'))).toBe('open');
    expect(resetWindow(at('2026-11-09', '21:59'))).toBe('outside-window');
  });

  it('allows retries until 05:59, never during the day', () => {
    expect(resetWindow(at('2026-11-10', '01:05'))).toBe('open');
    expect(resetWindow(at('2026-11-13', '05:59'))).toBe('open'); // Thursday's night
    expect(resetWindow(at('2026-11-10', '06:00'))).toBe('outside-window');
  });

  it('never on the nights of Friday and Saturday', () => {
    expect(resetWindow(at('2026-11-13', '22:05'))).toBe('day-off');
    expect(resetWindow(at('2026-11-14', '01:05'))).toBe('day-off');
    expect(resetWindow(at('2026-11-14', '22:05'))).toBe('day-off');
  });
});
