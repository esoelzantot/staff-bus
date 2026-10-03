import { describe, expect, it } from 'vitest';
import { cairoNow } from './cairoTime';

describe('cairoNow', () => {
  it('uses UTC+3 in summer and UTC+2 in winter', () => {
    expect(cairoNow(new Date('2026-07-01T21:10:00Z'))).toEqual({ date: '2026-07-02', hour: 0 });
    expect(cairoNow(new Date('2026-12-01T22:10:00Z'))).toEqual({ date: '2026-12-02', hour: 0 });
  });

  it('reports 23:xx as still the previous day (outside the reset window)', () => {
    expect(cairoNow(new Date('2026-12-01T21:10:00Z'))).toEqual({ date: '2026-12-01', hour: 23 });
  });
});
