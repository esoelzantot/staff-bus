/**
 * firestore.rules computes "today in Cairo" without a time-zone database (cairoSummer / cairoToday). This is the
 * SAME formula in TypeScript, checked against the real Africa/Cairo time zone for every hour of 2024–2032 and every
 * 15 minutes around each daylight-saving change. If Egypt changes its rules, this test fails – update both places.
 */
import { describe, expect, it } from 'vitest';
import { serviceDay } from '../../api/_lib/cairoTime.js';
import { serviceDayKey, todayKey } from '../../src/utils/date/format';

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

function rulesCairoClock(now: Date): Date {
  const t2 = new Date(now.getTime() + 2 * HOUR);
  return cairoSummer(t2) ? new Date(now.getTime() + 3 * HOUR) : t2;
}

function rulesCairoToday(now: Date): string {
  return dayKey(rulesCairoClock(now));
}

function rulesServiceDay(now: Date): string {
  const evening = rulesCairoClock(now).getTime() + 2 * HOUR;
  const wd = new Date(evening).getUTCDay();
  return dayKey(new Date(evening + (wd === 5 ? 48 : wd === 6 ? 24 : 0) * HOUR));
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

describe('the working day: server, app and rules agree', () => {
  it('every 15 minutes around the daylight-saving changes, and every hour of 2026–2028', () => {
    const wrong: string[] = [];
    const check = (now: Date) => {
      const day = serviceDay(now);
      if (serviceDayKey(now) !== day || rulesServiceDay(now) !== day) wrong.push(now.toISOString());
    };
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += HOUR) check(new Date(t));
    for (let year = 2024; year <= 2032; year++) {
      for (const month of [3, 9]) {
        for (let t = Date.UTC(year, month, 23); t < Date.UTC(year, month + 1, 1); t += 15 * 60_000) check(new Date(t));
      }
    }
    expect(wrong).toEqual([]);
  });
});
