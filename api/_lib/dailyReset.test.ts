import { describe, expect, it } from 'vitest';
import { planBusReset, planRecount, type EmployeeState } from './dailyReset.js';

const e = (
  id: string,
  type: EmployeeState['type'],
  going: 'in' | 'out',
  returning: 'in' | 'out',
  options: { hasRecordToday?: boolean; earlier?: [number, number]; stored?: number } = {},
): EmployeeState => ({
  id,
  type,
  goingStatus: going,
  returningStatus: returning,
  hasRecordToday: options.hasRecordToday ?? false,
  earlierThisMonth: { going: options.earlier?.[0] ?? 0, returning: options.earlier?.[1] ?? 0 },
  goingInCount: options.stored ?? 0,
  returningInCount: options.stored ?? 0,
});

const plan = (capacity: number, employees: EmployeeState[]) => {
  const p = planBusReset(capacity, employees);
  if ('error' in p) throw new Error(p.error);
  return p;
};
const of = (p: ReturnType<typeof plan>, id: string) => p.employees.find((x) => x.id === id)!;

describe('planBusReset – the rule: every main IN / IN, every waiting OUT / OUT', () => {
  it('whatever their statuses were yesterday', () => {
    const p = plan(14, [
      e('m1', 'main', 'out', 'out'),
      e('m2', 'main', 'in', 'out'),
      e('w1', 'waiting', 'in', 'in'),
      e('w2', 'waiting', 'out', 'in'),
    ]);
    for (const id of ['m1', 'm2']) expect(of(p, id)).toMatchObject({ going: 'in', returning: 'in' });
    for (const id of ['w1', 'w2']) expect(of(p, id)).toMatchObject({ going: 'out', returning: 'out' });
    expect(p).toMatchObject({ goingCount: 2, returningCount: 2 });
  });

  it('…and also for someone who already pressed IN / OUT after midnight (before the reset ran)', () => {
    const p = plan(14, [
      e('m1', 'main', 'out', 'out', { hasRecordToday: true }),
      e('w1', 'waiting', 'in', 'out', { hasRecordToday: true }),
    ]);
    expect(of(p, 'm1')).toMatchObject({ going: 'in', returning: 'in', overridden: true, record: 'update' });
    expect(of(p, 'w1')).toMatchObject({ going: 'out', returning: 'out', overridden: true, record: 'update' });
  });

  it("every employee gets today's record (created, or updated when it exists)", () => {
    const p = plan(14, [e('m1', 'main', 'in', 'in'), e('w1', 'waiting', 'out', 'out', { hasRecordToday: true })]);
    expect(of(p, 'm1').record).toBe('create');
    expect(of(p, 'w1').record).toBe('update');
  });
});

describe('planBusReset – the counters are THIS MONTH\'s IN days', () => {
  it('= IN days earlier this month (from the records) + today with the start status', () => {
    const p = plan(14, [
      e('m1', 'main', 'out', 'out', { earlier: [9, 7] }),
      e('w1', 'waiting', 'in', 'in', { earlier: [3, 2] }),
    ]);
    expect(of(p, 'm1')).toMatchObject({ goingInCount: 10, returningInCount: 8 });
    expect(of(p, 'w1')).toMatchObject({ goingInCount: 3, returningInCount: 2 });
  });

  it('the first of the month starts again: only today counts, whatever last month\'s total was', () => {
    const p = plan(14, [
      e('m1', 'main', 'in', 'in', { earlier: [0, 0], stored: 22 }),
      e('w1', 'waiting', 'out', 'out', { earlier: [0, 0], stored: 9 }),
    ]);
    expect(of(p, 'm1')).toMatchObject({ goingInCount: 1, returningInCount: 1, goingTally: -21 });
    expect(of(p, 'w1')).toMatchObject({ goingInCount: 0, returningInCount: 0 });
  });

  it('presses after midnight never add up: the number is recomputed, not incremented', () => {
    // a waiting employee pressed IN at 00:02 (stored counter went 3 → 4); the reset puts them OUT → 3 again
    const p = plan(14, [e('w1', 'waiting', 'in', 'out', { hasRecordToday: true, earlier: [3, 1], stored: 4 })]);
    expect(of(p, 'w1')).toMatchObject({ goingInCount: 3, returningInCount: 1 });
  });
});

describe('planBusReset – capacity', () => {
  it('refuses a roster whose main employees alone do not fit the bus', () => {
    const p = planBusReset(2, [e('a', 'main', 'in', 'in'), e('b', 'main', 'in', 'in'), e('c', 'main', 'in', 'in')]);
    expect('error' in p).toBe(true);
  });

  it('a full bus of main employees is fine', () => {
    expect(plan(2, [e('a', 'main', 'out', 'out'), e('b', 'main', 'out', 'out')])).toMatchObject({ goingCount: 2 });
  });
});

describe('planRecount (npm run recount-month)', () => {
  it('keeps the statuses and counts today with the CURRENT ones', () => {
    const [a, b] = planRecount([
      e('a', 'main', 'out', 'in', { earlier: [5, 4], stored: 140 }),
      e('b', 'waiting', 'in', 'out', { earlier: [1, 0], hasRecordToday: true }),
    ]);
    expect(a).toMatchObject({ going: 'out', returning: 'in', goingInCount: 5, returningInCount: 5, record: 'create' });
    expect(b).toMatchObject({ going: 'in', returning: 'out', goingInCount: 2, returningInCount: 0, record: 'update' });
  });
});
