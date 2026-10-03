import { describe, expect, it } from 'vitest';
import { formatAge, formatDate, formatDayLabel, todayKey } from './format';

describe('todayKey (Cairo day, whatever the phone says)', () => {
  it('rolls over at Cairo midnight in summer (UTC+3)', () => {
    expect(todayKey(new Date('2026-10-03T20:59:59Z'))).toBe('2026-10-03');
    expect(todayKey(new Date('2026-10-03T21:00:00Z'))).toBe('2026-10-04');
  });

  it('rolls over at Cairo midnight in winter (UTC+2)', () => {
    expect(todayKey(new Date('2026-12-10T21:59:59Z'))).toBe('2026-12-10');
    expect(todayKey(new Date('2026-12-10T22:00:00Z'))).toBe('2026-12-11');
  });
});

describe('day keys are calendar days, not moments', () => {
  it('formatDate keeps the day', () => {
    expect(formatDate('2026-10-03')).toBe('03 Oct 2026');
  });

  it('formatDayLabel names the right weekday (2026-10-03 is a Saturday)', () => {
    const label = formatDayLabel('2026-10-03');
    expect(label).toContain('السبت');
    expect(label).toContain('3');
  });
});

describe('formatAge (Arabic plurals)', () => {
  const s = (n: number) => formatAge(n * 1000);
  const m = (n: number) => formatAge(n * 60_000);
  const h = (n: number) => formatAge(n * 3_600_000);

  it('handles "now" and seconds', () => {
    expect(s(3)).toBe('الآن');
    expect(s(25)).toBe('منذ 25 ثانية');
  });

  it('uses the right word for minutes', () => {
    expect(m(1)).toBe('منذ دقيقة');
    expect(m(2)).toBe('منذ دقيقتين');
    expect(m(3)).toBe('منذ 3 دقائق');
    expect(m(10)).toBe('منذ 10 دقائق');
    expect(m(11)).toBe('منذ 11 دقيقة');
    expect(m(45)).toBe('منذ 45 دقيقة');
  });

  it('uses the right word for hours', () => {
    expect(h(1)).toBe('منذ ساعة');
    expect(h(2)).toBe('منذ ساعتين');
    expect(h(5)).toBe('منذ 5 ساعات');
    expect(h(12)).toBe('منذ 12 ساعة');
  });
});
