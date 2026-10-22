/**
 * firestore.rules computes "today in Cairo" without a time-zone database (cairoSummer / cairoToday). This is the
 * SAME formula in TypeScript, checked against the real Africa/Cairo time zone for every hour of 2024–2032 and every
 * 15 minutes around each daylight-saving change. If Egypt changes its rules, this test fails – update both places.
 */
import { describe, expect, it } from 'vitest';
import { todayKey } from '../../src/utils/date/format';

const HOUR = 3_600_000;
const pad2 = (n: number) => String(n).padStart(2, '0');
const dayKey = (t: Date) => `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;

/** Mirror of firestore.rules (Timestamp getters = UTC getters of the shifted date). */
function cairoSummer(t2: Date): boolean {
  const m = t2.getUTCMonth() + 1;
  const d = t2.getUTCDate();
  const wd = t2.getUTCDay(); // = dayOfWeek() % 7
  const sinceFriday = (wd - 5 + 7) % 7;
  const sinceThursday = (wd - 4 + 7) % 7;
  return (
    (m > 4 && m < 10) ||
    (m === 4 && d - sinceFriday >= 24) ||
    (m === 10 && !(d - sinceThursday >= 25 && (sinceThursday > 0 || t2.getUTCHours() >= 23)))
  );
}

function rulesCairoToday(now: Date): string {
  const t2 = new Date(now.getTime() + 2 * HOUR);
  return cairoSummer(t2) ? dayKey(new Date(now.getTime() + 3 * HOUR)) : dayKey(t2);
}

describe("the rules' Cairo day", () => {
  it('matches the real time zone every hour, 2024–2032', () => {
    const wrong: string[] = [];
    for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2033, 0, 1); t += HOUR) {
      const now = new Date(t);
      if (rulesCairoToday(now) !== todayKey(now)) wrong.push(now.toISOString());
    }
    expect(wrong).toEqual([]);
  });

  it('matches every 15 minutes around the daylight-saving changes', () => {
    const wrong: string[] = [];
    for (let year = 2024; year <= 2032; year++) {
      for (const month of [3, 9]) {
        // the last week of April / October, every 15 minutes
        for (let t = Date.UTC(year, month, 23); t < Date.UTC(year, month + 1, 1); t += 15 * 60_000) {
          const now = new Date(t);
          if (rulesCairoToday(now) !== todayKey(now)) wrong.push(now.toISOString());
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
