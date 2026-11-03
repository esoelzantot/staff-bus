import { describe, expect, it, vi } from 'vitest';
import type { ArrivalRecord } from '../arrivals';

// The Status column is Arabic, and Arabic is drawn by the browser on a canvas (pdfKit.drawText). Node has no canvas:
// a stand-in returns a 1×1 PNG, enough for jsPDF to build the document (the real look is checked in a browser).
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({ measureText: () => ({ width: 40 }), fillText: () => undefined }),
    toDataURL: () => PNG_1PX,
  }),
});
import { arrivalStatus, buildArrivalPdf, formatMinutesEn } from './generateArrivalPdf';

// November 2026, Cairo = UTC+2. ASCII-only names so the PDF text stays real, searchable text.
const at = (day: string, cairo: string) => new Date(`${day}T${cairo}:00+02:00`);
const records: ArrivalRecord[] = [
  { date: '2026-11-01', arrivalTime: at('2026-11-01', '08:38'), arrivedByName: 'Eslam' },
  { date: '2026-11-02', arrivalTime: at('2026-11-02', '09:25'), arrivedByName: 'Sara' },
];
const textOf = (doc: ReturnType<typeof buildArrivalPdf>) =>
  (doc as unknown as { internal: { pages: string[][] } }).internal.pages.flat().join(' ');

describe('buildArrivalPdf (monthly bus arrival record)', () => {
  const text = textOf(buildArrivalPdf({ route: 'Nozha', month: '2026-11', records, today: '2026-11-03' }));

  it('title, route, month and the 9:00 rule', () => {
    expect(text).toContain('Bus Arrival Record');
    expect(text).toContain('Nozha');
    expect(text).toContain('November 2026');
    expect(text).toContain('until 9:00 AM');
  });

  it('totals: recorded / on time / late and the times', () => {
    expect(text).toContain('Days recorded: 2 of 3');
    expect(text).toContain('On time: 1');
    expect(text).toContain('Late: 1');
    expect(text).toContain('Earliest: 8:38 AM');
    expect(text).toContain('Latest: 9:25 AM');
  });

  it('a row per working day in calendar order, with the time and who recorded it', () => {
    // lastIndexOf: the "Generated" line at the top can carry one of these dates too
    expect(text.lastIndexOf('01 Nov 2026')).toBeLessThan(text.lastIndexOf('02 Nov 2026'));
    expect(text.lastIndexOf('02 Nov 2026')).toBeLessThan(text.lastIndexOf('03 Nov 2026')); // today, nothing yet
    expect(text).toContain('8:38 AM');
    expect(text).toContain('Sara');
  });
});

describe('the Status column is Arabic', () => {
  it('بدري up to 9:00, متأخر after, لم يُسجَّل without an arrival', () => {
    expect(arrivalStatus(8 * 60 + 38).text).toBe('بدري');
    expect(arrivalStatus(9 * 60).text).toBe('بدري');
    expect(arrivalStatus(9 * 60 + 1).text).toBe('متأخر');
    expect(arrivalStatus(null).text).toBe('لم يُسجَّل');
  });
});

describe('formatMinutesEn', () => {
  it('12-hour English clock', () => {
    expect(formatMinutesEn(462)).toBe('7:42 AM');
    expect(formatMinutesEn(540)).toBe('9:00 AM');
    expect(formatMinutesEn(780)).toBe('1:00 PM');
  });
});
